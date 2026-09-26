import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit, Optional } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, readFileSync } from 'node:fs';
import { chmod, copyFile, mkdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BinariesService, normalizeOsArch, type BinaryTarget } from './binaries.service';
import {
  BINARY_KINDS,
  BINARY_STATUSES,
  BinaryResourceGithubImportDto,
  BinaryResourceImportDto,
  BinaryResourceUploadDto,
  ManagedBinaryKind,
  ManagedBinaryStatus
} from './dto/binary-resource.dto';
import { BINARY_TARGETS, BINARY_TARGET_VALUES } from './binary-targets';
import type { BatchBinaryResourceDto, BinaryBatchAction } from './dto/batch-binary-resource.dto';
import type { QueryBinaryDeploymentDto, QueryBinaryResourceDto } from './dto/query-binary-resource.dto';
import type { UpdateBinaryResourceDto } from './dto/update-binary-resource.dto';
import { DEFAULT_GITHUB_MIRRORS, DEFAULT_GITHUB_REPO_URL, SettingsService } from '../system/settings.service';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { appendPublicPath, resolvePublicBaseUrl } from '../common/public-url';
import { formatBinaryVersion, normalizeBinaryVersion } from '../common/binary-version';
import { fetchSafeRemoteBuffer } from '../common/safe-remote-fetch';
import {
  detectTargetFromText,
  detectVersionFromText,
  inspectBinaryPayload
} from './binary-inspector';

function parseBinaryResourceVersion(raw: string): { upstreamVersion: string; revision?: number } {
  const cleaned = raw.trim().replace(/^v/i, '');
  const match = cleaned.match(/^(.*?)-r(\d+)$/i);
  if (match) {
    return { upstreamVersion: match[1].trim(), revision: Number(match[2]) };
  }
  return { upstreamVersion: cleaned };
}

function compareVersions(left: string, right: string): number {
  const a = normalizeBinaryVersion(left).replace(/^v/i, '').split(/[.-]/);
  const b = normalizeBinaryVersion(right).replace(/^v/i, '').split(/[.-]/);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const na = Number(a[i] ?? 0);
    const nb = Number(b[i] ?? 0);
    if (Number.isFinite(na) && Number.isFinite(nb)) {
      if (na !== nb) return na > nb ? 1 : -1;
    } else {
      const sa = String(a[i] ?? '');
      const sb = String(b[i] ?? '');
      if (sa !== sb) return sa.localeCompare(sb);
    }
  }
  return 0;
}

const MAX_BINARY_SIZE = 100 * 1024 * 1024;
const GITHUB_API_MAX_BYTES = 5 * 1024 * 1024;

type ManifestFileEntry = {
  name: string;
  role?: 'main' | 'auxiliary';
  path: string;
  sha256?: string;
  size?: number;
};

type ManifestAssetEntry = {
  target: string;
  os: string;
  arch: string;
  files: ManifestFileEntry[];
};

type ManifestResourceEntry = {
  kind: ManagedBinaryKind | string;
  upstreamVersion: string;
  revision?: number;
  source?: string;
  status?: ManagedBinaryStatus;
  builtFromAppVersion?: string;
  compatibility?: Record<string, unknown>;
  cronetVersion?: string;
  notes?: string;
  isDefault?: boolean;
  assets: ManifestAssetEntry[];
};

type ManifestDocument = {
  schemaVersion?: number;
  applicationVersion?: string;
  resources?: ManifestResourceEntry[];
};

type NodeCompatibilityContext = {
  agentVersion?: string | null;
  agentProtocolVersion?: number | null;
};

type GithubApiReleaseAsset = {
  name?: string;
  size?: number;
  browser_download_url?: string;
};

type GithubApiRelease = {
  id?: number;
  tag_name?: string;
  name?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
  published_at?: string;
  created_at?: string;
  html_url?: string;
  assets?: GithubApiReleaseAsset[];
};

export interface GithubReleaseAssetItem {
  target: BinaryTarget;
  os: string;
  arch: string;
  name: string;
  size: number;
  downloadUrl: string;
  imported: boolean;
}

export interface GithubReleaseItem {
  tagName: string;
  version: string;
  name: string;
  publishedAt: string | null;
  prerelease: boolean;
  htmlUrl: string;
  notes: string | null;
  existingReleaseId: string | null;
  existingStatus: string | null;
  assets: GithubReleaseAssetItem[];
}

@Injectable()
export class BinaryResourcesService implements OnModuleInit {
  private readonly logger = new Logger(BinaryResourcesService.name);
  private readonly dataDir: string;
  private readonly runtimeDir: string;
  private readonly resourceDir: string;
  private readonly staticDir: string;
  private readonly seededMarkerPath: string;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly binaries?: BinariesService,
    @Optional() private readonly settingsService?: SettingsService,
    @Optional() private readonly systemLogs?: SystemLogsService
  ) {
    this.dataDir = process.env.RIRICLOUD_DATA_DIR
      ? resolve(process.env.RIRICLOUD_DATA_DIR)
      : resolve(process.cwd(), 'data');
    this.runtimeDir = resolve(this.dataDir, 'binaries');
    this.resourceDir = resolve(this.runtimeDir, 'resources');
    this.staticDir = resolve(process.env.RIRICLOUD_BINARY_DIR ?? join(process.cwd(), 'binaries'));
    this.seededMarkerPath = join(this.runtimeDir, '.seeded-releases.json');
  }

  async onModuleInit() {
    await this.cleanupLegacySingboxResources();
    const seededKeys = await this.readSeededKeys();
    const manifestResult = await this.syncManifests(seededKeys);
    await this.syncLegacyAssets(seededKeys);
    await this.writeSeededKeys(seededKeys);
    await this.retireSupersededBuiltins(manifestResult);
    await this.normalizeDefaults();
    await this.verifyAssetsAvailability();
    await this.binaries?.refresh();
  }

  async list(query: QueryBinaryResourceDto = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const search = query.search?.trim();
    const where: Prisma.BinaryReleaseWhereInput = {
      kind: 'AGENT',
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { upstreamVersion: { contains: search } },
              { notes: { contains: search } }
            ]
          }
        : {}),
      ...(query.platform ? { assets: { some: { target: { endsWith: `-${query.platform}` } } } } : {})
    };
    const [total, rows, matchingAssets] = await Promise.all([
      this.prisma.binaryRelease.count({ where }),
      this.prisma.binaryRelease.findMany({
        where,
        include: {
          assets: { include: { files: true }, orderBy: { target: 'asc' } },
          _count: { select: { deploymentTasks: true } }
        },
        orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.binaryRelease.findMany({
        where,
        select: { assets: { select: { size: true, storageRoot: true } } }
      })
    ]);
    const summary = matchingAssets.reduce(
      (acc, release) => {
        for (const asset of release.assets) {
          const size = asset.size || 0;
          acc.totalBytes += size;
          acc.reclaimableBytes += size;
        }
        return acc;
      },
      { totalBytes: 0, reclaimableBytes: 0 }
    );
    return {
      data: rows.map((row) => this.serializeRelease(row)),
      total,
      page,
      pageSize,
      supportedTargets: [...BINARY_TARGET_VALUES],
      summary
    };
  }

  async detail(id: string) {
    const row = await this.prisma.binaryRelease.findUnique({
      where: { id },
      include: {
        assets: { include: { files: true }, orderBy: { target: 'asc' } },
        deploymentTasks: {
          orderBy: { requestedAt: 'desc' },
          take: 20,
          include: { node: { select: { id: true, name: true } } }
        },
        _count: { select: { deploymentTasks: true } }
      }
    });
    if (!row) throw new NotFoundException('二进制资源不存在');
    return this.serializeRelease(row);
  }

  async deployments(id: string, query: QueryBinaryDeploymentDto = {}) {
    return this.listDeployments(id, query);
  }

  async listDeployments(id: string, query: QueryBinaryDeploymentDto = {}) {
    await this.requireRelease(id);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.BinaryDeploymentTaskWhereInput = {
      releaseId: id,
      ...(query.status ? { status: query.status } : {})
    };
    const [data, total] = await Promise.all([
      this.prisma.binaryDeploymentTask.findMany({
        where,
        include: { node: { select: { id: true, name: true } } },
        orderBy: { requestedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.binaryDeploymentTask.count({ where })
    ]);
    return { data, total, page, pageSize };
  }

  async activate(id: string, operatorId?: string) {
    const release = await this.requireRelease(id);
    const updated = await this.prisma.binaryRelease.update({
      where: { id },
      data: { status: 'ACTIVE' }
    });
    this.recordSystemLog(
      'RESOURCE_ACTIVATED',
      `启用二进制资源 ${formatBinaryVersion(release.kind, release.upstreamVersion, release.revision)}`,
      { releaseId: id, kind: release.kind, version: formatBinaryVersion(release.kind, release.upstreamVersion, release.revision) },
      operatorId
    );
    await this.binaries?.refresh();
    return this.detail(updated.id);
  }

  async disable(id: string, operatorId?: string) {
    const release = await this.requireRelease(id);
    const nextDefaultId = await this.prisma.$transaction(async (tx) => {
      await tx.binaryRelease.update({
        where: { id },
        data: { status: 'DISABLED', isDefault: false }
      });
      if (!release.isDefault) return null;
      const candidate = await tx.binaryRelease.findFirst({
        where: { kind: release.kind, status: 'ACTIVE', id: { not: id } },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }]
      });
      if (!candidate) return null;
      await tx.binaryRelease.update({ where: { id: candidate.id }, data: { isDefault: true } });
      return candidate.id;
    });
    this.recordSystemLog(
      'RESOURCE_DISABLED',
      `停用二进制资源 ${formatBinaryVersion(release.kind, release.upstreamVersion, release.revision)}`,
      { releaseId: id, kind: release.kind, nextDefaultId },
      operatorId
    );
    await this.binaries?.refresh();
    return this.detail(id);
  }

  async retire(id: string, operatorId?: string) {
    const release = await this.requireRelease(id);
    const nextDefaultId = await this.prisma.$transaction(async (tx) => {
      await tx.binaryRelease.update({
        where: { id },
        data: { status: 'RETIRED', isDefault: false }
      });
      if (!release.isDefault) return null;
      const candidate = await tx.binaryRelease.findFirst({
        where: { kind: release.kind, status: 'ACTIVE', id: { not: id } },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }]
      });
      if (!candidate) return null;
      await tx.binaryRelease.update({ where: { id: candidate.id }, data: { isDefault: true } });
      return candidate.id;
    });
    this.recordSystemLog(
      'RESOURCE_RETIRED',
      `归档二进制资源 ${formatBinaryVersion(release.kind, release.upstreamVersion, release.revision)}`,
      { releaseId: id, kind: release.kind, nextDefaultId },
      operatorId
    );
    await this.binaries?.refresh();
    return this.detail(id);
  }

  async restore(id: string, operatorId?: string) {
    const release = await this.requireRelease(id);
    if (release.status !== 'RETIRED') {
      throw new ConflictException('仅已归档资源可执行恢复');
    }
    await this.prisma.binaryRelease.update({
      where: { id },
      data: { status: 'DISABLED' }
    });
    this.recordSystemLog(
      'RESOURCE_RESTORED',
      `从归档恢复二进制资源 ${formatBinaryVersion(release.kind, release.upstreamVersion, release.revision)}`,
      { releaseId: id, kind: release.kind },
      operatorId
    );
    await this.binaries?.refresh();
    return this.detail(id);
  }

  async update(id: string, dto: UpdateBinaryResourceDto, operatorId?: string) {
    const release = await this.requireRelease(id);
    const data: Prisma.BinaryReleaseUpdateInput = {};
    if (dto.notes !== undefined) {
      data.notes = dto.notes.trim() || null;
    }
    if (dto.compatibility !== undefined) {
      data.compatibilityJson = JSON.stringify(this.normalizeCompatibility(dto.compatibility));
    }
    await this.prisma.binaryRelease.update({ where: { id }, data });
    this.recordSystemLog(
      'RESOURCE_UPDATED',
      `更新二进制资源信息 ${formatBinaryVersion(release.kind, release.upstreamVersion, release.revision)}`,
      { releaseId: id, updatedFields: Object.keys(data) },
      operatorId
    );
    return this.detail(id);
  }

  async remove(id: string, operatorId?: string) {
    const release = await this.prisma.binaryRelease.findUnique({
      where: { id },
      include: {
        assets: { select: { id: true, storageRoot: true, storagePath: true, size: true } },
        _count: { select: { deploymentTasks: true } }
      }
    });
    if (!release) throw new NotFoundException('二进制资源不存在');

    const freedBytes = release.assets.reduce((sum, asset) => sum + (asset.size || 0), 0);
    const versionText = formatBinaryVersion(release.kind, release.upstreamVersion, release.revision);

    const nextDefaultId = await this.prisma.$transaction(async (tx) => {
      const assetIds = release.assets.map((a) => a.id).filter(Boolean);
      const taskDelegate = (tx as unknown as {
        binaryDeploymentTask?: { updateMany?: (args: Record<string, unknown>) => Promise<unknown> };
      }).binaryDeploymentTask;
      if (taskDelegate?.updateMany) {
        await taskDelegate.updateMany({
          where: { OR: [{ releaseId: id }, ...(assetIds.length ? [{ assetId: { in: assetIds } }, { previousAssetId: { in: assetIds } }] : [])] },
          data: { releaseId: null, assetId: null, previousAssetId: null }
        });
      }

      const nodeDelegate = (tx as unknown as {
        node?: { updateMany?: (args: Record<string, unknown>) => Promise<unknown> };
      }).node;
      if (nodeDelegate?.updateMany && assetIds.length) {
        await nodeDelegate.updateMany({
          where: { currentAgentAssetId: { in: assetIds } },
          data: { currentAgentAssetId: null }
        });
      }

      await tx.binaryAssetFile.deleteMany({ where: { asset: { releaseId: id } } });
      await tx.binaryAsset.deleteMany({ where: { releaseId: id } });
      await tx.binaryRelease.delete({ where: { id } });

      if (!release.isDefault) return null;
      const candidate = await tx.binaryRelease.findFirst({
        where: { kind: release.kind, status: 'ACTIVE', id: { not: id } },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }]
      });
      if (!candidate) return null;
      await tx.binaryRelease.update({ where: { id: candidate.id }, data: { isDefault: true } });
      return candidate.id;
    });

    await rm(join(this.resourceDir, id), { recursive: true, force: true });

    // 将已删除的版本键写入种子标记，防止主控重启时从静态目录重复导入已删资源
    const seededKeys = await this.readSeededKeys();
    seededKeys.add(`${release.kind}:${release.upstreamVersion}:${release.revision}`);
    await this.writeSeededKeys(seededKeys);

    this.recordSystemLog(
      'RESOURCE_DELETED',
      `删除二进制资源 ${versionText}（释放 ${(freedBytes / 1024 / 1024).toFixed(2)} MB）`,
      {
        releaseId: id,
        kind: release.kind,
        upstreamVersion: release.upstreamVersion,
        revision: release.revision,
        freedBytes,
        nextDefaultId
      },
      operatorId
    );
    await this.binaries?.refresh();
    return { id, deleted: true };
  }

  async batch(dto: BatchBinaryResourceDto, operatorId?: string) {
    const uniqueIds = Array.from(new Set(dto.ids.map((id) => id.trim()).filter(Boolean)));
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const id of uniqueIds) {
      try {
        await this.runBatchItem(dto.action, id, operatorId);
        results.push({ id, ok: true });
      } catch (err) {
        results.push({ id, ok: false, error: err instanceof Error ? err.message : '操作失败' });
      }
    }
    const succeeded = results.filter((item) => item.ok).length;
    return { action: dto.action, total: uniqueIds.length, succeeded, failed: uniqueIds.length - succeeded, results };
  }

  private async runBatchItem(action: BinaryBatchAction, id: string, operatorId?: string) {
    if (action === 'activate') return this.activate(id, operatorId);
    if (action === 'disable') return this.disable(id, operatorId);
    if (action === 'retire') return this.retire(id, operatorId);
    return this.remove(id, operatorId);
  }

  async setDefault(id: string, operatorId?: string) {
    const release = await this.requireRelease(id);
    await this.prisma.$transaction([
      this.prisma.binaryRelease.updateMany({
        where: { kind: release.kind, isDefault: true },
        data: { isDefault: false }
      }),
      this.prisma.binaryRelease.update({
        where: { id },
        data: { status: 'ACTIVE', isDefault: true }
      })
    ]);
    this.recordSystemLog(
      'RESOURCE_DEFAULT_CHANGED',
      `设置默认二进制资源为 ${formatBinaryVersion(release.kind, release.upstreamVersion, release.revision)}`,
      { releaseId: id, kind: release.kind },
      operatorId
    );
    await this.binaries?.refresh();
    return this.detail(id);
  }

  async importRemote(dto: BinaryResourceImportDto, operatorId?: string) {
    const body = await this.fetchRemoteWithMirrorFallback(dto.url, MAX_BINARY_SIZE);
    const inspected = inspectBinaryPayload({
      buffer: body,
      hintFilename: dto.filename,
      hintUrl: dto.url,
      explicitTarget: dto.target,
      explicitVersion: dto.upstreamVersion
    });

    if (dto.sha256 && inspected.sha256.toLowerCase() !== dto.sha256.toLowerCase()) {
      throw new BadRequestException(`二进制文件 SHA-256 校验不匹配（实际: ${inspected.sha256}）`);
    }

    const upstreamVersion = inspected.upstreamVersion || this.readMasterVersion();
    if (!upstreamVersion || upstreamVersion === '0.0.0') {
      throw new BadRequestException('无法从下载链接或二进制文件中自动识别版本号，请手动指定版本号');
    }

    return this.storeSingleBinary({
      kind: 'AGENT',
      upstreamVersion,
      revision: dto.revision ?? 1,
      target: inspected.target,
      filename: inspected.filename,
      sha256: inspected.sha256,
      builtFromAppVersion: dto.builtFromAppVersion ?? upstreamVersion,
      compatibilityJson: dto.compatibilityJson,
      notes: dto.notes,
      source: 'REMOTE',
      body: inspected.binary,
      operatorId
    });
  }

  async upload(
    dto: BinaryResourceUploadDto,
    file: Buffer | { buffer?: Buffer; originalname?: string } | undefined,
    operatorId?: string
  ) {
    const buffer = Buffer.isBuffer(file) ? file : file?.buffer;
    const originalname = Buffer.isBuffer(file) ? undefined : file?.originalname;
    if (!buffer?.length) throw new BadRequestException('缺少上传文件');
    if (buffer.length > MAX_BINARY_SIZE) throw new BadRequestException('二进制文件超过 100MB 限制');

    const inspected = inspectBinaryPayload({
      buffer,
      hintFilename: dto.filename || originalname,
      explicitTarget: dto.target,
      explicitVersion: dto.upstreamVersion
    });

    if (dto.sha256 && inspected.sha256.toLowerCase() !== dto.sha256.toLowerCase()) {
      throw new BadRequestException(`二进制文件 SHA-256 校验不匹配（实际: ${inspected.sha256}）`);
    }

    const upstreamVersion = inspected.upstreamVersion || this.readMasterVersion();
    if (!upstreamVersion || upstreamVersion === '0.0.0') {
      throw new BadRequestException('无法从上传文件自动识别版本号，请在文件名中包含版本号或手动填写');
    }

    return this.storeSingleBinary({
      kind: 'AGENT',
      upstreamVersion,
      revision: dto.revision ?? 1,
      target: inspected.target,
      filename: inspected.filename,
      sha256: inspected.sha256,
      builtFromAppVersion: dto.builtFromAppVersion ?? upstreamVersion,
      compatibilityJson: dto.compatibilityJson,
      notes: dto.notes,
      source: 'UPLOAD',
      body: inspected.binary,
      operatorId
    });
  }

  /**
   * 从系统设置配置的 githubRepoUrl 获取预设的 GitHub Release 列表及各平台资产导入状态
   */
  async listGithubReleases(): Promise<{
    repoUrl: string;
    githubRepoUrl: string;
    owner: string;
    repo: string;
    githubMirrorUrls: string[];
    releases: GithubReleaseItem[];
  }> {
    const settings = await this.settingsService?.getSettings();
    const githubRepoUrl = settings?.githubRepoUrl?.trim() || DEFAULT_GITHUB_REPO_URL;
    const githubMirrorUrls = settings?.githubMirrorUrls?.length ? settings.githubMirrorUrls : [...DEFAULT_GITHUB_MIRRORS];
    const { owner, repo } = this.parseGithubRepo(githubRepoUrl);

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=20`;
    const rawReleases = await this.fetchGithubJson<GithubApiRelease[]>(apiUrl);

    const localReleases = await this.prisma.binaryRelease.findMany({
      where: { kind: 'AGENT' },
      include: { assets: { select: { target: true, available: true } } }
    });
    const localByVersion = new Map(
      localReleases.map((rel) => [normalizeBinaryVersion(rel.upstreamVersion), rel])
    );

    const releases: GithubReleaseItem[] = [];
    for (const item of Array.isArray(rawReleases) ? rawReleases : []) {
      if (item.draft) continue;
      const tagName = (item.tag_name ?? '').trim();
      if (!tagName) continue;

      const matchedAssets: GithubReleaseAssetItem[] = [];
      const seenTargets = new Set<BinaryTarget>();

      for (const rawAsset of item.assets ?? []) {
        const assetName = (rawAsset.name ?? '').trim();
        const downloadUrl = (rawAsset.browser_download_url ?? '').trim();
        if (!assetName || !downloadUrl) continue;
        if (assetName === 'checksums.txt' || assetName.endsWith('.sha256') || assetName.endsWith('.sig')) continue;
        // 仅选取 Agent 资产（或带平台标识的归档/二进制），忽略 riri-master 主控包
        if (assetName.startsWith('riri-master')) continue;

        const target = detectTargetFromText(assetName);
        if (!target || seenTargets.has(target)) continue;
        seenTargets.add(target);

        const [, os, arch] = target.split('-');
        matchedAssets.push({
          target,
          os,
          arch,
          name: assetName,
          size: Number(rawAsset.size ?? 0),
          downloadUrl,
          imported: false
        });
      }

      if (matchedAssets.length === 0) continue;

      const version =
        detectVersionFromText(tagName) ??
        detectVersionFromText(matchedAssets[0]?.name) ??
        tagName.replace(/^(?:agent-)?v/i, '');

      const localMatch = localByVersion.get(normalizeBinaryVersion(version));
      const importedTargets = new Set(
        (localMatch?.assets ?? []).filter((a) => a.available).map((a) => a.target)
      );
      for (const asset of matchedAssets) {
        asset.imported = importedTargets.has(asset.target);
      }
      matchedAssets.sort((a, b) => a.target.localeCompare(b.target));

      releases.push({
        tagName,
        version,
        name: item.name?.trim() || tagName,
        publishedAt: item.published_at ?? item.created_at ?? null,
        prerelease: Boolean(item.prerelease),
        htmlUrl: item.html_url ?? `${githubRepoUrl.replace(/\/+$/, '')}/releases/tag/${encodeURIComponent(tagName)}`,
        notes: item.body?.trim() ? item.body.trim().slice(0, 1000) : null,
        existingReleaseId: localMatch?.id ?? null,
        existingStatus: localMatch?.status ?? null,
        assets: matchedAssets
      });
    }

    return {
      repoUrl: githubRepoUrl,
      githubRepoUrl,
      owner,
      repo,
      githubMirrorUrls,
      releases
    };
  }

  /**
   * 从项目 GitHub Release 一键拉取指定版本（全平台或所选平台）的二进制资源
   */
  async importFromGithubRelease(dto: BinaryResourceGithubImportDto, operatorId?: string) {
    const { releases } = await this.listGithubReleases();
    const targetRelease = releases.find(
      (item) => item.tagName === dto.tagName || normalizeBinaryVersion(item.version) === normalizeBinaryVersion(dto.tagName)
    );
    if (!targetRelease) {
      throw new NotFoundException(`未在项目 GitHub Release 中找到版本 ${dto.tagName}`);
    }

    const wantedTargets = dto.targets?.length
      ? new Set(dto.targets)
      : new Set(targetRelease.assets.map((a) => a.target));
    const assetsToFetch = targetRelease.assets.filter((a) => wantedTargets.has(a.target));
    if (assetsToFetch.length === 0) {
      throw new BadRequestException('该 Release 中没有匹配的平台资产可供拉取');
    }

    let lastReleaseDetail: Awaited<ReturnType<typeof this.detail>> | null = null;
    const importedTargets: string[] = [];
    const results: Array<{ target: string; ok: boolean; error?: string }> = [];

    for (const asset of assetsToFetch) {
      try {
        const buffer = await this.fetchRemoteWithMirrorFallback(asset.downloadUrl, MAX_BINARY_SIZE);
        const inspected = inspectBinaryPayload({
          buffer,
          hintFilename: asset.name,
          hintUrl: asset.downloadUrl,
          explicitTarget: asset.target,
          explicitVersion: targetRelease.version
        });
        lastReleaseDetail = await this.storeSingleBinary({
          kind: 'AGENT',
          upstreamVersion: targetRelease.version,
          revision: 1,
          target: inspected.target,
          filename: inspected.filename,
          sha256: inspected.sha256,
          builtFromAppVersion: targetRelease.version,
          notes: dto.notes ?? (targetRelease.notes ? `GitHub Release ${targetRelease.tagName}` : undefined),
          source: 'GITHUB',
          body: inspected.binary,
          operatorId,
          silentAudit: true
        });
        importedTargets.push(inspected.target);
        results.push({ target: inspected.target, ok: true });
      } catch (err) {
        results.push({
          target: asset.target,
          ok: false,
          error: err instanceof Error ? err.message : '拉取失败'
        });
      }
    }

    if (importedTargets.length === 0) {
      const firstErr = results.find((r) => !r.ok)?.error;
      throw new BadRequestException(firstErr || '所有平台资产拉取均失败');
    }

    this.recordSystemLog(
      'RESOURCE_GITHUB_IMPORTED',
      `从 GitHub Release (${targetRelease.tagName}) 拉取二进制资源 v${targetRelease.version}（${importedTargets.length} 个平台）`,
      {
        tagName: targetRelease.tagName,
        version: targetRelease.version,
        targets: importedTargets,
        releaseId: lastReleaseDetail?.id ?? null
      },
      operatorId
    );

    const succeeded = results.filter((r) => r.ok).length;
    const failed = results.length - succeeded;

    return {
      tagName: targetRelease.tagName,
      version: targetRelease.version,
      succeeded,
      failed,
      results,
      release: lastReleaseDetail,
      importedTargets
    };
  }

  async resolveForNode(
    kindInput: 'agent' | 'singbox',
    osArch: string | null | undefined,
    token: string,
    requestBaseUrl?: string,
    resourceId?: string,
    nodeContext: NodeCompatibilityContext = {}
  ) {
    const kind: ManagedBinaryKind = kindInput === 'agent' ? 'AGENT' : ('SINGBOX' as ManagedBinaryKind);
    const platform = normalizeOsArch(osArch) ?? 'linux-amd64';
    const target = `${kindInput}-${platform}` as BinaryTarget;
    const asset = await this.findNodeAsset(kind, target, resourceId, nodeContext);
    if (!asset) {
      if (resourceId) throw new NotFoundException('所选二进制资源不存在、未启用或不支持该节点架构');
      const fallback = await this.binaries?.resolveForNode(kindInput, osArch, token, requestBaseUrl);
      if (!fallback) throw new NotFoundException(`主控未找到 ${target} 的可用二进制`);
      return { ...fallback, files: [] };
    }
    const baseUrl = await this.resolveDownloadBaseUrl(requestBaseUrl);
    const mainFile = asset.files.find((item) => item.role === 'main') ?? asset.files[0];
    const files = asset.files.map((file) => ({
      id: file.id,
      name: file.name,
      role: (file.role === 'auxiliary' ? 'auxiliary' : 'main') as 'main' | 'auxiliary',
      sha256: file.sha256,
      size: file.size,
      url: appendPublicPath(baseUrl, `api/v1/downloads/binary-files/${file.id}`)
    }));
    return {
      resourceId: asset.release.id,
      assetId: asset.id,
      version: formatBinaryVersion(asset.release.kind, asset.release.upstreamVersion, asset.release.revision),
      sha256: mainFile?.sha256 ?? asset.sha256,
      url: mainFile
        ? appendPublicPath(baseUrl, `api/v1/downloads/binary-files/${mainFile.id}`)
        : appendPublicPath(baseUrl, `api/v1/downloads/binaries/${target}`),
      files
    };
  }

  async getDownloadAsset(assetId: string) {
    const asset = await this.prisma.binaryAsset.findUnique({
      where: { id: assetId },
      include: { release: true, files: { orderBy: { role: 'desc' } } }
    });
    if (!asset || !asset.available || asset.release.status !== 'ACTIVE') {
      throw new NotFoundException('二进制资产不存在或未启用');
    }
    const file = asset.files.find((item) => item.role === 'main') ?? asset.files[0];
    const path = this.resolveStoragePath(file?.storageRoot ?? asset.storageRoot, file?.storagePath ?? asset.storagePath);
    const inspected = await this.inspectFile(path);
    const expectedSha = (file?.sha256 ?? asset.sha256).toLowerCase();
    if (!inspected || inspected.sha256.toLowerCase() !== expectedSha) {
      throw new NotFoundException('二进制资产文件缺失或校验失败');
    }
    return { asset, file, path };
  }

  async getDownloadFile(fileId: string) {
    const file = await this.prisma.binaryAssetFile.findUnique({
      where: { id: fileId },
      include: { asset: { include: { release: true } } }
    });
    if (!file || !file.asset.available || file.asset.release.status !== 'ACTIVE') {
      throw new NotFoundException('二进制资源文件不存在或未启用');
    }
    const path = this.resolveStoragePath(file.storageRoot, file.storagePath);
    const inspected = await this.inspectFile(path);
    if (!inspected || inspected.sha256.toLowerCase() !== file.sha256.toLowerCase()) {
      throw new NotFoundException('二进制资源文件校验失败');
    }
    return { file: { ...file, size: inspected.size }, path };
  }

  async getDownloadableFile(fileId: string) {
    const file = await this.prisma.binaryAssetFile.findUnique({
      where: { id: fileId },
      include: { asset: { include: { release: true } } }
    });
    if (!file || !file.asset.available || file.asset.release.status !== 'ACTIVE') {
      throw new NotFoundException('二进制资源文件不存在或未启用');
    }
    const path = this.resolveStoragePath(file.storageRoot, file.storagePath);
    const inspected = await this.inspectFile(path);
    if (!inspected || inspected.sha256.toLowerCase() !== file.sha256.toLowerCase()) {
      throw new NotFoundException('二进制资源文件校验失败');
    }
    return {
      id: file.id,
      filename: file.name,
      path,
      size: inspected.size,
      sha256: inspected.sha256
    };
  }

  private async findNodeAsset(
    kind: string,
    target: string,
    resourceId?: string,
    nodeContext: NodeCompatibilityContext = {}
  ) {
    const releases = await this.prisma.binaryRelease.findMany({
      where: resourceId
        ? {
            kind,
            status: 'ACTIVE',
            OR: [{ id: resourceId }, ...this.buildVersionSelector(kind, resourceId)]
          }
        : { kind, status: 'ACTIVE' },
      include: {
        assets: {
          where: { target, available: true },
          include: { files: { orderBy: { role: 'desc' } } }
        }
      },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }]
    });
    let incompatibilityReason: string | null = null;
    for (const release of releases) {
      const asset = release.assets[0];
      if (!asset) continue;
      const compatibilityError = this.checkCompatibility(release.compatibilityJson, nodeContext);
      if (compatibilityError) {
        incompatibilityReason = compatibilityError;
        if (resourceId) throw new ConflictException(compatibilityError);
        continue;
      }
      const verified = await this.verifyAssetFiles(asset);
      if (verified) return { ...asset, release };
    }
    if (incompatibilityReason) throw new ConflictException(incompatibilityReason);
    return undefined;
  }

  private buildVersionSelector(kind: string, value: string): Prisma.BinaryReleaseWhereInput[] {
    const parsed = parseBinaryResourceVersion(value);
    const normalized = normalizeBinaryVersion(value);
    return [
      { kind, upstreamVersion: parsed.upstreamVersion, ...(parsed.revision ? { revision: parsed.revision } : {}) },
      { kind, upstreamVersion: normalized }
    ];
  }

  private checkCompatibility(compatibilityJson: string, context: NodeCompatibilityContext): string | null {
    let compatibility: Record<string, unknown>;
    try {
      compatibility = JSON.parse(compatibilityJson || '{}') as Record<string, unknown>;
    } catch {
      return null;
    }
    const minProtocol = typeof compatibility.minAgentProtocolVersion === 'number'
      ? compatibility.minAgentProtocolVersion
      : undefined;
    if (minProtocol !== undefined && (context.agentProtocolVersion ?? 1) < minProtocol) {
      return `资源要求 Agent 协议版本至少为 v${minProtocol}，请先升级节点 Agent`;
    }
    const maxProtocol = typeof compatibility.maxAgentProtocolVersion === 'number'
      ? compatibility.maxAgentProtocolVersion
      : undefined;
    if (maxProtocol !== undefined && context.agentProtocolVersion && context.agentProtocolVersion > maxProtocol) {
      return `资源仅兼容 Agent 协议版本不超过 v${maxProtocol}`;
    }
    const minAgentVersion = typeof compatibility.minAgentVersion === 'string'
      ? compatibility.minAgentVersion
      : undefined;
    if (minAgentVersion && context.agentVersion && compareVersions(context.agentVersion, minAgentVersion) < 0) {
      return `资源要求 Agent 版本至少为 v${normalizeBinaryVersion(minAgentVersion)}，请先升级节点 Agent`;
    }
    const maxAgentVersion = typeof compatibility.maxAgentVersion === 'string'
      ? compatibility.maxAgentVersion
      : undefined;
    if (maxAgentVersion && context.agentVersion && compareVersions(context.agentVersion, maxAgentVersion) > 0) {
      return `资源仅兼容 Agent 版本不超过 v${normalizeBinaryVersion(maxAgentVersion)}`;
    }
    return null;
  }

  private async verifyAssetFiles(asset: {
    storageRoot: string;
    storagePath: string;
    sha256: string;
    files: Array<{ storageRoot: string; storagePath: string; sha256: string }>;
  }): Promise<boolean> {
    if (!asset.files.length) {
      const path = this.resolveStoragePath(asset.storageRoot, asset.storagePath);
      const file = await this.inspectFile(path);
      return Boolean(file && file.sha256.toLowerCase() === asset.sha256.toLowerCase());
    }
    for (const item of asset.files) {
      const path = this.resolveStoragePath(item.storageRoot, item.storagePath);
      const file = await this.inspectFile(path);
      if (!file || file.sha256.toLowerCase() !== item.sha256.toLowerCase()) return false;
    }
    return true;
  }

  private async storeSingleBinary(input: {
    kind: ManagedBinaryKind;
    upstreamVersion: string;
    revision?: number;
    target: string;
    filename?: string;
    sha256: string;
    builtFromAppVersion?: string;
    compatibilityJson?: string;
    notes?: string;
    source: 'LOCAL' | 'UPLOAD' | 'REMOTE' | 'GITHUB';
    body: Buffer;
    operatorId?: string;
    silentAudit?: boolean;
  }) {
    if (!BINARY_KINDS.includes(input.kind)) throw new BadRequestException('不支持的二进制资源类型');
    const definition = BINARY_TARGETS.find((item) => item.target === input.target && item.kind === input.kind);
    if (!definition) throw new BadRequestException('资源类型与目标平台不匹配');
    const actualSha = createHash('sha256').update(input.body).digest('hex');
    if (actualSha.toLowerCase() !== input.sha256.toLowerCase()) {
      throw new BadRequestException(`二进制文件 SHA-256 校验不匹配（实际: ${actualSha}）`);
    }
    const compatibility = this.parseCompatibilityJson(input.compatibilityJson);
    const parsedVersion = parseBinaryResourceVersion(input.upstreamVersion);
    const revision = input.revision ?? parsedVersion.revision ?? 1;
    const os = definition.target.split('-')[1];
    const arch = definition.target.split('-')[2];
    const defaultName = os === 'windows' ? 'riri-agent.exe' : 'riri-agent';
    const filename = this.sanitizeFilename(input.filename ?? defaultName);

    const hasExistingDefault = await this.prisma.binaryRelease.findFirst({
      where: { kind: input.kind, status: 'ACTIVE', isDefault: true }
    });

    const release = await this.prisma.binaryRelease.upsert({
      where: {
        kind_upstreamVersion_revision: {
          kind: input.kind,
          upstreamVersion: parsedVersion.upstreamVersion,
          revision
        }
      },
      update: {
        ...(input.builtFromAppVersion !== undefined ? { builtFromAppVersion: input.builtFromAppVersion || null } : {}),
        ...(input.compatibilityJson !== undefined ? { compatibilityJson: JSON.stringify(compatibility) } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {})
      },
      create: {
        kind: input.kind,
        upstreamVersion: parsedVersion.upstreamVersion,
        revision,
        source: input.source,
        status: 'ACTIVE',
        builtFromAppVersion: input.builtFromAppVersion || parsedVersion.upstreamVersion,
        compatibilityJson: JSON.stringify(compatibility),
        notes: input.notes || null,
        isDefault: !hasExistingDefault
      }
    });

    const relativePath = join('resources', release.id, definition.target, filename).split(sep).join('/');
    const fullPath = this.resolveStoragePath('RUNTIME', relativePath);
    await this.writeAtomically(fullPath, input.body);

    const asset = await this.prisma.binaryAsset.upsert({
      where: { releaseId_target: { releaseId: release.id, target: definition.target } },
      update: {
        os,
        arch,
        filename,
        storageRoot: 'RUNTIME',
        storagePath: relativePath,
        sha256: actualSha,
        size: input.body.length,
        available: true
      },
      create: {
        releaseId: release.id,
        target: definition.target,
        os,
        arch,
        filename,
        storageRoot: 'RUNTIME',
        storagePath: relativePath,
        sha256: actualSha,
        size: input.body.length,
        available: true
      }
    });
    await this.prisma.binaryAssetFile.deleteMany({ where: { assetId: asset.id } });
    await this.prisma.binaryAssetFile.create({
      data: {
        assetId: asset.id,
        name: filename,
        role: 'main',
        storageRoot: 'RUNTIME',
        storagePath: relativePath,
        sha256: actualSha,
        size: input.body.length
      }
    });

    if (!input.silentAudit) {
      this.recordSystemLog(
        'RESOURCE_IMPORTED',
        `${input.source === 'UPLOAD' ? '上传' : '导入'}二进制资源 ${formatBinaryVersion(input.kind, parsedVersion.upstreamVersion, revision)} (${definition.target})`,
        {
          releaseId: release.id,
          assetId: asset.id,
          source: input.source,
          target: definition.target,
          sha256: actualSha,
          version: formatBinaryVersion(input.kind, parsedVersion.upstreamVersion, revision)
        },
        input.operatorId
      );
    }

    await this.binaries?.refresh();
    return this.detail(release.id);
  }

  private async cleanupLegacySingboxResources(): Promise<void> {
    try {
      await this.prisma.binaryRelease.updateMany({
        where: { status: { in: ['DRAFT', 'RETIRED'] } },
        data: { status: 'DISABLED', isDefault: false }
      });
      const legacy = await this.prisma.binaryRelease.findMany({
        where: { kind: { not: 'AGENT' } },
        select: { id: true }
      });
      if (!legacy.length) return;
      const ids = legacy.map((item) => item.id);
      await this.prisma.binaryAssetFile.deleteMany({ where: { asset: { releaseId: { in: ids } } } });
      await this.prisma.binaryAsset.deleteMany({ where: { releaseId: { in: ids } } });
      for (const id of ids) {
        await this.prisma.binaryRelease.delete({ where: { id } }).catch(() => undefined);
        await rm(join(this.resourceDir, id), { recursive: true, force: true }).catch(() => undefined);
      }
    } catch {
      // 忽略旧表结构迁移前的清理异常
    }
  }

  private async syncManifests(seededKeys?: Set<string>): Promise<{ keys: Set<string>; staticManifestLoaded: boolean }> {
    const keys = new Set<string>();
    let staticManifestLoaded = false;
    const candidates = [
      { path: join(this.staticDir, 'manifest.json'), isStatic: true },
      { path: join(this.runtimeDir, 'manifest.json'), isStatic: false }
    ];
    for (const candidate of candidates) {
      try {
        const raw = await readFile(candidate.path, 'utf8');
        const manifest = JSON.parse(raw) as ManifestDocument;
        const manifestRoot = dirname(candidate.path);
        for (const resource of manifest.resources ?? []) {
          if (resource.kind !== 'AGENT') continue;
          const parsed = parseBinaryResourceVersion(resource.upstreamVersion);
          const revision = resource.revision ?? parsed.revision ?? 1;
          const key = `${resource.kind}:${parsed.upstreamVersion}:${revision}`;
          keys.add(key);
          // 若该版本之前已初始化过且已被管理员删除，则跳过不再自动恢复
          if (seededKeys?.has(key)) {
            const existing = await this.prisma.binaryRelease.findUnique({
              where: {
                kind_upstreamVersion_revision: {
                  kind: 'AGENT',
                  upstreamVersion: parsed.upstreamVersion,
                  revision
                }
              }
            });
            if (!existing) continue;
          }
          await this.upsertManifestResource(manifestRoot, {
            ...resource,
            builtFromAppVersion: resource.builtFromAppVersion ?? manifest.applicationVersion
          });
          seededKeys?.add(key);
        }
        if (candidate.isStatic) staticManifestLoaded = true;
      } catch {
        // manifest 是可选增强；旧目录结构通过 syncLegacyAssets 认领。
      }
    }
    return { keys, staticManifestLoaded };
  }

  private async upsertManifestResource(manifestRoot: string, resource: ManifestResourceEntry) {
    if (!BINARY_KINDS.includes(resource.kind as ManagedBinaryKind)) return;
    const parsedVersion = parseBinaryResourceVersion(resource.upstreamVersion);
    const revision = resource.revision ?? parsedVersion.revision ?? 1;
    const compatibility = {
      ...(resource.compatibility ?? {}),
      ...(resource.cronetVersion ? { cronetVersion: resource.cronetVersion } : {})
    };
    const identity = {
      kind: resource.kind as ManagedBinaryKind,
      upstreamVersion: parsedVersion.upstreamVersion,
      revision
    };
    const existing = await this.prisma.binaryRelease.findUnique({
      where: { kind_upstreamVersion_revision: identity }
    });
    const release = existing
      ? await this.prisma.binaryRelease.update({
          where: { id: existing.id },
          data: {
            builtFromAppVersion: resource.builtFromAppVersion ?? existing.builtFromAppVersion,
            compatibilityJson: JSON.stringify(compatibility),
            ...(resource.notes ? { notes: resource.notes } : {})
          }
        })
      : await this.prisma.binaryRelease.create({
          data: {
            ...identity,
            source: resource.source ?? 'LOCAL',
            status: resource.status && BINARY_STATUSES.includes(resource.status) ? resource.status : 'ACTIVE',
            builtFromAppVersion: resource.builtFromAppVersion ?? null,
            compatibilityJson: JSON.stringify(compatibility),
            notes: resource.notes ?? null,
            isDefault: Boolean(resource.isDefault)
          }
        });

    for (const assetEntry of resource.assets ?? []) {
      if (!assetEntry.files?.length) continue;
      if (!(BINARY_TARGET_VALUES as readonly string[]).includes(assetEntry.target)) continue;
      const verifiedFiles: Array<ManifestFileEntry & { sha256: string; size: number; storageRoot: 'STATIC' | 'RUNTIME'; storagePath: string }> = [];
      for (const fileEntry of assetEntry.files) {
        const fullPath = resolve(manifestRoot, fileEntry.path);
        const inspected = await this.inspectFile(fullPath);
        if (!inspected) continue;
        if (fileEntry.sha256 && inspected.sha256.toLowerCase() !== fileEntry.sha256.toLowerCase()) {
          this.logger.warn(`manifest 文件哈希不匹配，跳过 ${fullPath}`);
          continue;
        }
        const storageRoot = fullPath.startsWith(this.staticDir) ? 'STATIC' : 'RUNTIME';
        const storagePath = storageRoot === 'STATIC'
          ? relative(this.staticDir, fullPath).split(sep).join('/')
          : relative(this.runtimeDir, fullPath).startsWith('..')
            ? relative(manifestRoot, fullPath).split(sep).join('/')
            : relative(this.runtimeDir, fullPath).split(sep).join('/');
        verifiedFiles.push({
          ...fileEntry,
          sha256: inspected.sha256,
          size: inspected.size,
          storageRoot,
          storagePath
        });
      }
      if (verifiedFiles.length !== assetEntry.files.length) continue;
      const main = verifiedFiles.find((item) => item.role !== 'auxiliary') ?? verifiedFiles[0];
      const asset = await this.prisma.binaryAsset.upsert({
        where: { releaseId_target: { releaseId: release.id, target: assetEntry.target } },
        update: {
          os: assetEntry.os,
          arch: assetEntry.arch,
          filename: main.name,
          storageRoot: main.storageRoot,
          storagePath: main.storagePath,
          sha256: main.sha256,
          size: main.size,
          available: true
        },
        create: {
          releaseId: release.id,
          target: assetEntry.target,
          os: assetEntry.os,
          arch: assetEntry.arch,
          filename: main.name,
          storageRoot: main.storageRoot,
          storagePath: main.storagePath,
          sha256: main.sha256,
          size: main.size,
          available: true
        }
      });
      await this.prisma.binaryAssetFile.deleteMany({ where: { assetId: asset.id } });
      await this.prisma.binaryAssetFile.createMany({
        data: verifiedFiles.map((file) => ({
          assetId: asset.id,
          name: file.name,
          role: file.role ?? 'main',
          storageRoot: file.storageRoot,
          storagePath: file.storagePath,
          sha256: file.sha256,
          size: file.size
        }))
      });
    }
  }

  private async syncLegacyAssets(seededKeys?: Set<string>) {
    if (!this.binaries) return;
    const masterVersion = this.readMasterVersion();
    for (const { kind, target } of BINARY_TARGETS) {
      let legacy: ReturnType<BinariesService['getAsset']>;
      try {
        legacy = this.binaries.getAsset(target);
      } catch {
        continue;
      }
      const existing = await this.prisma.binaryAsset.findFirst({
        where: { target, sha256: legacy.sha256 },
        include: { release: true }
      });
      if (existing) continue;
      const upstreamVersion = normalizeBinaryVersion(legacy.version || masterVersion || '0.0.0');
      const key = `${kind}:${upstreamVersion}:1`;
      if (seededKeys?.has(key)) {
        const existingRelease = await this.prisma.binaryRelease.findUnique({
          where: { kind_upstreamVersion_revision: { kind, upstreamVersion, revision: 1 } }
        });
        if (!existingRelease) continue;
      }
      const release = await this.prisma.binaryRelease.upsert({
        where: { kind_upstreamVersion_revision: { kind, upstreamVersion, revision: 1 } },
        update: {},
        create: {
          kind,
          upstreamVersion,
          revision: 1,
          source: legacy.imported ? 'REMOTE' : 'LOCAL',
          status: 'ACTIVE',
          builtFromAppVersion: masterVersion,
          isDefault: !legacy.imported
        }
      });
      seededKeys?.add(key);
      const storageRoot = legacy.path.startsWith(this.staticDir) ? 'STATIC' : 'RUNTIME';
      const baseDir = storageRoot === 'STATIC' ? this.staticDir : this.runtimeDir;
      const storagePath = relative(baseDir, legacy.path).startsWith('..')
        ? legacy.path
        : relative(baseDir, legacy.path).split(sep).join('/');
      const os = target.split('-')[1];
      const arch = target.split('-')[2];
      const asset = await this.prisma.binaryAsset.upsert({
        where: { releaseId_target: { releaseId: release.id, target } },
        update: {},
        create: {
          releaseId: release.id,
          target,
          os,
          arch,
          filename: legacy.filename,
          storageRoot,
          storagePath,
          sha256: legacy.sha256,
          size: legacy.size,
          available: true
        }
      });
      if (asset.sha256 !== legacy.sha256) continue;
      await this.prisma.binaryAssetFile.deleteMany({ where: { assetId: asset.id } });
      await this.prisma.binaryAssetFile.create({
        data: {
          assetId: asset.id,
          name: legacy.filename,
          role: 'main',
          storageRoot,
          storagePath,
          sha256: legacy.sha256,
          size: legacy.size
        }
      });
    }
  }

  private async retireSupersededBuiltins(manifest: { keys: Set<string>; staticManifestLoaded: boolean }) {
    if (!manifest.staticManifestLoaded || !manifest.keys.size) return;
    const builtins = await this.prisma.binaryRelease.findMany({
      where: { source: { in: ['BUILTIN', 'LOCAL'] }, status: { not: 'DISABLED' } }
    });
    for (const release of builtins) {
      const key = `${release.kind}:${release.upstreamVersion}:${release.revision}`;
      if (manifest.keys.has(key)) continue;
      const nextDefaultId = await this.prisma.$transaction(async (tx) => {
        await tx.binaryRelease.update({
          where: { id: release.id },
          data: { status: 'DISABLED', isDefault: false }
        });
        if (!release.isDefault) return null;
        const candidate = await tx.binaryRelease.findFirst({
          where: { kind: release.kind, status: 'ACTIVE', id: { not: release.id } },
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }]
        });
        if (!candidate) return null;
        await tx.binaryRelease.update({ where: { id: candidate.id }, data: { isDefault: true } });
        return candidate.id;
      });
      this.recordSystemLog(
        'RESOURCE_DISABLED',
        `自动停用旧版本资源 ${formatBinaryVersion(release.kind, release.upstreamVersion, release.revision)}`,
        { releaseId: release.id, kind: release.kind, reason: 'builtin-superseded', nextDefaultId }
      );
    }
  }

  private async normalizeDefaults() {
    for (const kind of BINARY_KINDS) {
      const defaults = await this.prisma.binaryRelease.findMany({
        where: { kind, isDefault: true },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }]
      });
      const activeDefaults = defaults.filter((item) => item.status === 'ACTIVE');
      if (activeDefaults.length === 1 && defaults.length === 1) continue;
      if (activeDefaults.length >= 1) {
        const keep = activeDefaults[0];
        const staleIds = defaults.filter((item) => item.id !== keep.id).map((item) => item.id);
        if (staleIds.length) {
          await this.prisma.binaryRelease.updateMany({
            where: { id: { in: staleIds } },
            data: { isDefault: false }
          });
        }
        continue;
      }
      if (defaults.length) {
        await this.prisma.binaryRelease.updateMany({
          where: { id: { in: defaults.map((item) => item.id) } },
          data: { isDefault: false }
        });
      }
      const fallback = await this.prisma.binaryRelease.findFirst({
        where: { kind, status: 'ACTIVE' },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }]
      });
      if (fallback) {
        await this.prisma.binaryRelease.update({ where: { id: fallback.id }, data: { isDefault: true } });
      }
    }
  }

  private async verifyAssetsAvailability() {
    const releases = await this.prisma.binaryRelease.findMany({
      where: { status: { in: ['ACTIVE', 'DISABLED', 'DRAFT'] } },
      include: { assets: { include: { files: true } } }
    });
    for (const release of releases) {
      if (!release.assets.length) continue;
      let availableCount = 0;
      const unavailableAssetIds: string[] = [];
      for (const asset of release.assets) {
        const verified = await this.verifyAssetFiles(asset);
        if (verified) {
          availableCount += 1;
          if (!asset.available) {
            await this.prisma.binaryAsset.update({ where: { id: asset.id }, data: { available: true } });
          }
        } else {
          unavailableAssetIds.push(asset.id);
          if (asset.available) {
            await this.prisma.binaryAsset.update({ where: { id: asset.id }, data: { available: false } });
          }
        }
      }
      if (release.status === 'ACTIVE' && availableCount === 0) {
        const nextDefaultId = await this.prisma.$transaction(async (tx) => {
          await tx.binaryRelease.update({
            where: { id: release.id },
            data: { status: 'DISABLED', isDefault: false }
          });
          if (!release.isDefault) return null;
          const candidate = await tx.binaryRelease.findFirst({
            where: { kind: release.kind, status: 'ACTIVE', id: { not: release.id } },
            orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }]
          });
          if (!candidate) return null;
          await tx.binaryRelease.update({ where: { id: candidate.id }, data: { isDefault: true } });
          return candidate.id;
        });
        this.logger.warn(`二进制资源 ${release.kind}:${release.upstreamVersion}-r${release.revision} 所有资产文件不可用，已自动停用`);
        this.recordSystemLog(
          'RESOURCE_DISABLED',
          `二进制资源 ${formatBinaryVersion(release.kind, release.upstreamVersion, release.revision)} 因文件缺失或校验不符已自动停用`,
          { releaseId: release.id, kind: release.kind, reason: 'all-assets-unavailable', unavailableAssetIds, nextDefaultId },
          undefined,
          'WARN'
        );
      }
    }
  }

  private serializeRelease<T extends {
    id: string;
    kind: string;
    upstreamVersion: string;
    revision: number;
    _count?: { deploymentTasks: number };
  }>(release: T) {
    const { _count, ...rest } = release;
    return {
      ...rest,
      version: formatBinaryVersion(release.kind, release.upstreamVersion, release.revision),
      ...(_count ? { deploymentCount: _count.deploymentTasks } : {})
    };
  }

  private async requireRelease(id: string) {
    const release = await this.prisma.binaryRelease.findUnique({ where: { id } });
    if (!release) throw new NotFoundException('二进制资源不存在');
    return release;
  }

  private recordSystemLog(
    action: string,
    message: string,
    metadata: Record<string, unknown>,
    operatorId?: string,
    level: 'INFO' | 'WARN' | 'ERROR' = 'INFO'
  ): void {
    this.systemLogs?.enqueue({
      source: 'SERVER',
      level,
      module: 'BinaryResource',
      userId: operatorId ?? null,
      message,
      metadata: { action, ...metadata }
    });
  }

  private parseGithubRepo(repoUrl: string): { owner: string; repo: string } {
    try {
      const parsed = new URL(repoUrl);
      const parts = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/');
      if (parts.length >= 2 && parts[0] && parts[1]) {
        return { owner: parts[0], repo: parts[1].replace(/\.git$/i, '') };
      }
    } catch {
      // fallback below
    }
    return { owner: 'Nanako660', repo: 'riricloud' };
  }

  private async fetchGithubJson<T>(url: string): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'RiriCloud-Master'
        },
        signal: AbortSignal.timeout(12_000)
      });
    } catch (error) {
      throw new BadRequestException(`连接 GitHub API 失败: ${(error as Error).message}`);
    }
    if (!response.ok) {
      throw new BadRequestException(`GitHub API 请求失败 (HTTP ${response.status})`);
    }
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > GITHUB_API_MAX_BYTES) {
      throw new BadRequestException('GitHub API 响应体过大');
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new BadRequestException('解析 GitHub API 响应失败');
    }
  }

  private async fetchRemoteWithMirrorFallback(rawUrl: string, maxBytes: number): Promise<Buffer> {
    const isGithubReleaseUrl = /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\//i.test(rawUrl);
    if (!isGithubReleaseUrl) {
      return fetchSafeRemoteBuffer(rawUrl, { maxBytes });
    }
    const settings = await this.settingsService?.getSettings();
    const mirrors = settings?.githubMirrorUrls?.length ? settings.githubMirrorUrls : [...DEFAULT_GITHUB_MIRRORS];
    const candidates: string[] = [];
    for (const mirror of mirrors) {
      const clean = mirror.trim().replace(/\/+$/, '');
      if (!clean) continue;
      const prefix = clean.includes('://') ? clean : `https://${clean}`;
      candidates.push(`${prefix}/${rawUrl}`);
    }
    candidates.push(rawUrl);

    let lastError: Error | null = null;
    for (const candidate of candidates) {
      try {
        return await fetchSafeRemoteBuffer(candidate, {
          maxBytes,
          connectTimeoutMs: 15_000,
          timeoutMs: 120_000
        });
      } catch (error) {
        lastError = error as Error;
      }
    }
    throw new BadRequestException(`远程文件下载失败: ${lastError?.message ?? '所有镜像源均不可用'}`);
  }

  private async readSeededKeys(): Promise<Set<string>> {
    try {
      const raw = await readFile(this.seededMarkerPath, 'utf8');
      const parsed = JSON.parse(raw) as { keys?: unknown };
      if (Array.isArray(parsed.keys)) {
        return new Set(parsed.keys.filter((k): k is string => typeof k === 'string'));
      }
    } catch {
      // 首次运行尚无标记文件
    }
    return new Set();
  }

  private async writeSeededKeys(keys: Set<string>): Promise<void> {
    try {
      await mkdir(dirname(this.seededMarkerPath), { recursive: true });
      await writeFile(this.seededMarkerPath, JSON.stringify({ keys: Array.from(keys) }, null, 2), 'utf8');
    } catch {
      // 忽略写入异常
    }
  }

  private resolveStoragePath(storageRoot: string, storagePath: string): string {
    if (storagePath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(storagePath)) return resolve(storagePath);
    const root = storageRoot === 'STATIC' ? this.staticDir : this.runtimeDir;
    const resolved = resolve(root, storagePath);
    const rel = relative(root, resolved);
    if (rel.startsWith('..') || rel.includes(`..${sep}`)) {
      throw new BadRequestException('非法的二进制存储路径');
    }
    return resolved;
  }

  private async writeAtomically(targetPath: string, body: Buffer) {
    await mkdir(dirname(targetPath), { recursive: true });
    const tempPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(tempPath, body, { mode: 0o755 });
      await chmod(tempPath, 0o755).catch(() => undefined);
      try {
        await rename(tempPath, targetPath);
      } catch {
        await copyFile(tempPath, targetPath);
        await chmod(targetPath, 0o755).catch(() => undefined);
        await unlink(tempPath).catch(() => undefined);
      }
    } catch (err) {
      await unlink(tempPath).catch(() => undefined);
      throw err;
    }
  }

  private async inspectFile(path: string): Promise<{ sha256: string; size: number } | undefined> {
    try {
      const file = await stat(path);
      if (!file.isFile() || file.size > MAX_BINARY_SIZE) return undefined;
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(path)) hash.update(chunk);
      return { sha256: hash.digest('hex'), size: file.size };
    } catch {
      return undefined;
    }
  }

  private parseCompatibilityJson(value?: string): Record<string, unknown> {
    if (!value?.trim()) return {};
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new BadRequestException('compatibilityJson 必须是合法 JSON 对象');
    }
    return this.normalizeCompatibility(parsed);
  }

  private normalizeCompatibility(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('兼容性约束必须是 JSON 对象');
    }
    const allowedNumberKeys = new Set(['minAgentProtocolVersion', 'maxAgentProtocolVersion']);
    const allowedStringKeys = new Set(['minAgentVersion', 'maxAgentVersion', 'cronetVersion']);
    const normalized: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === undefined || item === null || item === '') continue;
      if (allowedNumberKeys.has(key)) {
        if (typeof item !== 'number' || !Number.isInteger(item) || item < 1 || item > 999) {
          throw new BadRequestException(`${key} 必须是 1 到 999 的整数`);
        }
        normalized[key] = item;
        continue;
      }
      if (allowedStringKeys.has(key)) {
        if (typeof item !== 'string' || item.trim().length > 64) {
          throw new BadRequestException(`${key} 必须是长度不超过 64 的字符串`);
        }
        normalized[key] = item.trim();
        continue;
      }
      throw new BadRequestException(`不支持的兼容性约束字段: ${key}`);
    }
    return normalized;
  }

  private sanitizeFilename(value: string): string {
    const clean = value.trim().replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!clean || clean === '.' || clean === '..') throw new BadRequestException('文件名无效');
    return clean;
  }

  private async resolveDownloadBaseUrl(requestBaseUrl?: string): Promise<string> {
    const settings = await this.settingsService?.getSettings();
    return resolvePublicBaseUrl({
      configuredBaseUrl: settings?.binaryDownloadBaseUrl || settings?.publicBaseUrl,
      requestBaseUrl
    });
  }

  private readMasterVersion(): string {
    const candidates = [join(process.cwd(), '..', '..', 'package.json'), join(process.cwd(), 'package.json')];
    for (const path of candidates) {
      try {
        return JSON.parse(readFileSync(path, 'utf8')).version ?? '0.0.0';
      } catch {
        // 尝试下一个路径
      }
    }
    return process.env.npm_package_version ?? '0.0.0';
  }
}
