import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { access, chmod, mkdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { appendPublicPath, resolvePublicBaseUrl } from '../common/public-url';
import { fetchSafeRemoteBuffer } from '../common/safe-remote-fetch';
import { BinariesService, normalizeOsArch } from './binaries.service';
import { BINARY_TARGET_VALUES } from './binary-targets';
import {
  BINARY_KINDS,
  type BinaryResourceImportDto,
  type BinaryResourceUploadDto,
  type ManagedBinaryKind
} from './dto/binary-resource.dto';
import type { QueryBinaryResourceDto, QueryBinaryDeploymentDto, QueryBinaryAuditLogDto } from './dto/query-binary-resource.dto';
import type { UpdateBinaryResourceDto } from './dto/update-binary-resource.dto';
import type { BatchBinaryResourceDto } from './dto/batch-binary-resource.dto';

const execFile = promisify(execFileCallback);
const MAX_BINARY_SIZE = 100 * 1024 * 1024;

// 兼容性约束的可写字段白名单：协议版本要求为数字，其余为字符串。
const COMPATIBILITY_NUMBER_KEYS = ['minAgentProtocolVersion', 'maxAgentProtocolVersion'] as const;
const COMPATIBILITY_STRING_KEYS = ['minAgentVersion', 'maxAgentVersion', 'cronetVersion'] as const;

type ResourceFileInput = {
  name: string;
  role?: string;
  path: string;
  sha256?: string;
  size?: number;
};

type ManifestResource = {
  kind: ManagedBinaryKind;
  upstreamVersion: string;
  revision?: number;
  source?: string;
  status?: string;
  builtFromAppVersion?: string;
  compatibilityJson?: string | Record<string, unknown>;
  cronetVersion?: string;
  notes?: string;
  isDefault?: boolean;
  assets?: Array<{
    target: string;
    os?: string;
    arch?: string;
    files: ResourceFileInput[];
  }>;
};

type BinaryManifest = {
  schemaVersion?: number;
  resources?: ManifestResource[];
};

@Injectable()
export class BinaryResourcesService implements OnModuleInit {
  private readonly logger = new Logger(BinaryResourcesService.name);
  private readonly dataDir: string;
  private readonly runtimeDir: string;
  private readonly resourceDir: string;
  private readonly staticDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly binaries: BinariesService
  ) {
    this.dataDir = process.env.RIRICLOUD_DATA_DIR
      ? resolve(process.env.RIRICLOUD_DATA_DIR)
      : resolve(process.cwd(), 'data');
    this.runtimeDir = resolve(this.dataDir, 'binaries');
    this.resourceDir = resolve(this.runtimeDir, 'resources');
    this.staticDir = resolve(process.env.RIRICLOUD_BINARY_DIR ?? join(process.cwd(), 'binaries'));
  }

  async onModuleInit(): Promise<void> {
    await mkdir(this.resourceDir, { recursive: true });
    const manifest = await this.syncManifests();
    await this.binaries.refresh();
    await this.syncLegacyAssets();
    await this.retireSupersededBuiltins(manifest);
    await this.verifyAssetsAvailability();
    await this.normalizeDefaults();
    await this.binaries.refresh();
    this.logger.log('二进制资源中心已初始化');
  }

  async list(query: QueryBinaryResourceDto = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = {
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? { OR: [{ upstreamVersion: { contains: query.search } }, { notes: { contains: query.search } }] }
        : {}),
      ...(query.platform ? { assets: { some: { target: { endsWith: `-${query.platform}` } } } } : {})
    };
    const [rows, total] = await Promise.all([
      this.prisma.binaryRelease.findMany({
        where,
        include: {
          assets: { orderBy: { target: 'asc' } },
          _count: { select: { deploymentTasks: true } }
        },
        orderBy: [{ kind: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.binaryRelease.count({ where })
    ]);
    return {
      data: rows.map((release) => this.serializeRelease(release)),
      total,
      page,
      pageSize,
      supportedTargets: BINARY_TARGET_VALUES
    };
  }

  async detail(id: string) {
    const release = await this.prisma.binaryRelease.findUnique({
      where: { id },
      include: {
        assets: { include: { files: true }, orderBy: { target: 'asc' } },
        deploymentTasks: {
          include: { node: { select: { id: true, name: true } } },
          orderBy: { requestedAt: 'desc' },
          take: 50
        }
      }
    });
    if (!release) throw new NotFoundException('二进制资源不存在');
    return this.serializeRelease(release);
  }

  async deployments(id: string, query: QueryBinaryDeploymentDto = {}) {
    await this.requireRelease(id);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = {
      releaseId: id,
      ...(query.status ? { status: query.status } : {})
    };
    const [rows, total] = await Promise.all([
      this.prisma.binaryDeploymentTask.findMany({
        where,
        include: { node: { select: { id: true, name: true } } },
        orderBy: { requestedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.binaryDeploymentTask.count({ where })
    ]);
    return { data: rows, total, page, pageSize };
  }

  async importRemote(dto: BinaryResourceImportDto, operatorId?: string) {
    const body = await fetchSafeRemoteBuffer(dto.url, { maxBytes: MAX_BINARY_SIZE });
    return this.saveResource(dto, body, operatorId, 'REMOTE');
  }

  async upload(dto: BinaryResourceUploadDto, body: Buffer, operatorId?: string) {
    return this.saveResource(dto, body, operatorId, 'UPLOAD');
  }

  async activate(id: string, operatorId?: string) {
    const release = await this.requireRelease(id);
    if (release.status === 'RETIRED') throw new ConflictException('已归档资源不能启用');
    const result = await this.prisma.binaryRelease.update({ where: { id }, data: { status: 'ACTIVE' } });
    await this.audit('RESOURCE_ACTIVATED', { releaseId: id, operatorId });
    await this.binaries.refresh();
    return result;
  }

  async disable(id: string, operatorId?: string) {
    const release = await this.requireRelease(id);
    const { updated, defaultTransferredTo } = await this.prisma.$transaction(async (tx) => {
      const result = await tx.binaryRelease.update({
        where: { id },
        data: { status: 'DISABLED', isDefault: false }
      });
      const transferredTo = await this.transferDefault(tx, release);
      return { updated: result, defaultTransferredTo: transferredTo };
    });
    await this.audit('RESOURCE_DISABLED', {
      releaseId: id,
      operatorId,
      metadataJson: JSON.stringify({ defaultTransferredTo: defaultTransferredTo ?? null })
    });
    await this.binaries.refresh();
    return updated;
  }

  async retire(id: string, operatorId?: string) {
    const release = await this.requireRelease(id);
    const { updated, defaultTransferredTo } = await this.prisma.$transaction(async (tx) => {
      const result = await tx.binaryRelease.update({
        where: { id },
        data: { status: 'RETIRED', isDefault: false }
      });
      const transferredTo = await this.transferDefault(tx, release);
      return { updated: result, defaultTransferredTo: transferredTo };
    });
    await this.audit('RESOURCE_RETIRED', {
      releaseId: id,
      operatorId,
      metadataJson: JSON.stringify({ previousStatus: release.status, defaultTransferredTo: defaultTransferredTo ?? null })
    });
    await this.binaries.refresh();
    return updated;
  }

  async restore(id: string, operatorId?: string) {
    const release = await this.requireRelease(id);
    if (release.status !== 'RETIRED') throw new ConflictException('只有已归档资源可以恢复');
    const result = await this.prisma.binaryRelease.update({ where: { id }, data: { status: 'DISABLED' } });
    await this.audit('RESOURCE_RESTORED', { releaseId: id, operatorId });
    await this.binaries.refresh();
    return result;
  }

  async update(id: string, dto: UpdateBinaryResourceDto, operatorId?: string) {
    await this.requireRelease(id);
    const data: { notes?: string | null; compatibilityJson?: string } = {};
    if (dto.notes !== undefined) data.notes = dto.notes.trim() || null;
    if (dto.compatibility !== undefined) data.compatibilityJson = JSON.stringify(this.normalizeCompatibility(dto.compatibility));
    if (!Object.keys(data).length) throw new BadRequestException('没有需要更新的字段');
    const result = await this.prisma.binaryRelease.update({ where: { id }, data });
    await this.audit('RESOURCE_UPDATED', {
      releaseId: id,
      operatorId,
      metadataJson: JSON.stringify({ fields: Object.keys(data) })
    });
    await this.binaries.refresh();
    return result;
  }

  async remove(id: string, operatorId?: string) {
    const release = await this.prisma.binaryRelease.findUnique({
      where: { id },
      include: { assets: true, _count: { select: { deploymentTasks: true } } }
    });
    if (!release) throw new NotFoundException('二进制资源不存在');
    if (release.source === 'BUILTIN') throw new ConflictException('内置资源不可删除');
    if (release.status === 'ACTIVE') throw new ConflictException('启用中的资源不可删除，请先停用');
    if (release._count.deploymentTasks > 0) {
      throw new ConflictException('资源已有分发历史，为保证审计可追溯请使用归档');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.binaryAssetFile.deleteMany({ where: { asset: { releaseId: id } } });
      await tx.binaryAsset.deleteMany({ where: { releaseId: id } });
      await tx.binaryRelease.delete({ where: { id } });
    });
    // 上传/远程导入的文件固定位于 RUNTIME 下 resources/<releaseId>/，可整目录清理；
    // STATIC 资产与内置/旧目录认领文件共享静态目录，只删 DB 行不动磁盘。
    if (release.assets.every((asset) => asset.storageRoot === 'RUNTIME')) {
      await rm(join(this.runtimeDir, 'resources', release.id), { recursive: true, force: true }).catch((error) => {
        this.logger.warn(`清理资源文件失败 release=${release.id}: ${error instanceof Error ? error.message : error}`);
      });
    }
    await this.audit('RESOURCE_DELETED', {
      operatorId,
      metadataJson: JSON.stringify({
        kind: release.kind,
        version: this.versionOf(release),
        targets: release.assets.map((asset) => asset.target),
        freedBytes: release.assets.reduce((sum, asset) => sum + asset.size, 0)
      })
    });
    await this.binaries.refresh();
    return { id, deleted: true };
  }

  async batch(dto: BatchBinaryResourceDto, operatorId?: string) {
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const id of dto.ids) {
      try {
        if (dto.action === 'delete') await this.remove(id, operatorId);
        else if (dto.action === 'activate') await this.activate(id, operatorId);
        else if (dto.action === 'disable') await this.disable(id, operatorId);
        else await this.retire(id, operatorId);
        results.push({ id, ok: true });
      } catch (error) {
        results.push({ id, ok: false, error: error instanceof Error ? error.message : '操作失败' });
      }
    }
    const succeeded = results.filter((item) => item.ok).length;
    return { action: dto.action, succeeded, failed: results.length - succeeded, results };
  }

  async auditLogs(query: QueryBinaryAuditLogDto = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = {
      ...(query.releaseId ? { releaseId: query.releaseId } : {}),
      ...(query.action ? { action: query.action } : {})
    };
    const [rows, total] = await Promise.all([
      this.prisma.binaryAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.binaryAuditLog.count({ where })
    ]);
    const operatorIds = [...new Set(rows.map((row) => row.operatorId).filter((id): id is string => Boolean(id)))];
    const users = operatorIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: operatorIds } }, select: { id: true, nickname: true, email: true } })
      : [];
    const operators = new Map(users.map((user) => [user.id, user]));
    return {
      data: rows.map((row) => ({ ...row, operator: row.operatorId ? operators.get(row.operatorId) ?? null : null })),
      total,
      page,
      pageSize
    };
  }

  async setDefault(id: string, operatorId?: string) {
    const release = await this.requireRelease(id);
    if (release.status !== 'ACTIVE') throw new ConflictException('只有 ACTIVE 资源可以设为默认');
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.binaryRelease.updateMany({ where: { kind: release.kind }, data: { isDefault: false } });
      return tx.binaryRelease.update({ where: { id }, data: { isDefault: true } });
    });
    await this.audit('RESOURCE_DEFAULT_CHANGED', { releaseId: id, operatorId });
    await this.binaries.refresh();
    return result;
  }

  // 停用/归档清除默认标记后，把默认转移到同类型最新的 ACTIVE 资源，避免出现无默认版本可用。
  private async transferDefault(tx: Prisma.TransactionClient, release: { id: string; kind: string; isDefault: boolean }): Promise<string | null> {
    if (!release.isDefault) return null;
    const candidate = await tx.binaryRelease.findFirst({
      where: { kind: release.kind, status: 'ACTIVE', id: { not: release.id } },
      orderBy: { updatedAt: 'desc' }
    });
    if (!candidate) return null;
    await tx.binaryRelease.update({ where: { id: candidate.id }, data: { isDefault: true } });
    return candidate.id;
  }

  private normalizeCompatibility(input: Record<string, unknown>): Record<string, unknown> {
    for (const [key, value] of Object.entries(input)) {
      if ((COMPATIBILITY_NUMBER_KEYS as readonly string[]).includes(key)) {
        if (typeof value !== 'number' || !Number.isFinite(value)) throw new BadRequestException(`兼容性字段 ${key} 必须为数字`);
        continue;
      }
      if ((COMPATIBILITY_STRING_KEYS as readonly string[]).includes(key)) {
        if (typeof value !== 'string') throw new BadRequestException(`兼容性字段 ${key} 必须为字符串`);
        continue;
      }
      throw new BadRequestException(`不支持的兼容性字段: ${key}`);
    }
    return input;
  }

  private parseCompatibilityInput(raw: string): Record<string, unknown> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadRequestException('compatibilityJson 必须是合法 JSON');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new BadRequestException('compatibilityJson 必须是 JSON 对象');
    }
    return this.normalizeCompatibility(parsed as Record<string, unknown>);
  }

  async getDownloadAsset(id: string) {
    const asset = await this.prisma.binaryAsset.findUnique({ where: { id }, include: { release: true, files: true } });
    if (!asset || !asset.available) throw new NotFoundException('平台二进制资产不存在');
    const file = asset.files.find((item) => item.role === 'main') ?? asset.files[0];
    const path = this.resolveStoredPath(file?.storageRoot ?? asset.storageRoot, file?.storagePath ?? asset.storagePath);
    await this.assertFile(path);
    return { asset, file, path };
  }

  async getDownloadFile(id: string) {
    const file = await this.prisma.binaryAssetFile.findUnique({ include: { asset: { include: { release: true } } }, where: { id } });
    if (!file || !file.asset.available) throw new NotFoundException('二进制文件不存在');
    const path = this.resolveStoredPath(file.storageRoot, file.storagePath);
    await this.assertFile(path);
    return { asset: file.asset, file, path };
  }

  async resolveForNode(
    kind: 'agent' | 'singbox',
    osArch: string | null | undefined,
    _token: string,
    requestBaseUrl?: string,
    releaseId?: string,
    node?: { agentProtocolVersion?: number | null; agentVersion?: string | null }
  ) {
    const normalized = normalizeOsArch(osArch) ?? 'linux-amd64';
    const target = `${kind}-${normalized}`;
    const releaseKind = kind.toUpperCase() as ManagedBinaryKind;
    const releases = await this.prisma.binaryRelease.findMany({
      where: { kind: releaseKind, status: 'ACTIVE', ...(releaseId ? { id: releaseId } : {}) },
      include: { assets: { include: { files: true } } },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }]
    });
    const release = releases.find((candidate) => candidate.assets.some((asset) => asset.target === target && asset.available));
    if (!release) throw new Error(`主控未找到 ${kind} 的 ${normalized} ACTIVE 资源`);
    const asset = release.assets.find((candidate) => candidate.target === target && candidate.available);
    if (!asset) throw new Error(`主控未找到 ${kind} 的 ${normalized} 资源资产`);
    const compatibility = this.parseCompatibility(release.compatibilityJson);
    this.assertCompatible(compatibility, node);
    const base = resolvePublicBaseUrl({ configuredBaseUrl: undefined, requestBaseUrl });
    const files = (asset.files.length ? asset.files : [{ id: asset.id, name: asset.filename, role: 'main', sha256: asset.sha256, size: asset.size, assetFallback: true }]).map((file) => ({
      id: file.id,
      name: file.name,
      role: file.role,
      sha256: file.sha256,
      size: file.size,
      url: appendPublicPath(
        base,
        `${'assetFallback' in file && file.assetFallback ? 'api/v1/downloads/binary-assets' : 'api/v1/downloads/binary-files'}/${file.id}`
      )
    }));
    const main = files.find((file) => file.role === 'main') ?? files[0];
    return {
      resourceId: release.id,
      assetId: asset.id,
      kind: releaseKind,
      target,
      version: this.versionOf(release),
      sha256: asset.sha256,
      url: appendPublicPath(base, `api/v1/downloads/binary-assets/${asset.id}`),
      files,
      mainFileId: main?.id ?? asset.id
    };
  }

  private async saveResource(
    dto: BinaryResourceImportDto | BinaryResourceUploadDto,
    body: Buffer,
    operatorId: string | undefined,
    source: 'UPLOAD' | 'REMOTE'
  ) {
    if (body.length > MAX_BINARY_SIZE) throw new Error('binary file exceeds size limit');
    const actual = createHash('sha256').update(body).digest('hex');
    if (actual.toLowerCase() !== dto.sha256.toLowerCase()) throw new Error(`binary checksum mismatch: got ${actual}`);
    const targetParts = dto.target.split('-');
    const kind = dto.kind;
    if (`${kind.toLowerCase()}-${targetParts.slice(1).join('-')}` !== dto.target) throw new Error('binary target does not match kind');
    const normalizedCompatibility = dto.compatibilityJson?.trim()
      ? JSON.stringify(this.parseCompatibilityInput(dto.compatibilityJson))
      : undefined;
    const release = await this.prisma.binaryRelease.upsert({
      where: { kind_upstreamVersion_revision: { kind, upstreamVersion: dto.upstreamVersion.trim(), revision: dto.revision ?? 1 } },
      update: {
        builtFromAppVersion: dto.builtFromAppVersion?.trim() || undefined,
        compatibilityJson: normalizedCompatibility,
        notes: dto.notes?.trim() || undefined
      },
      create: {
        kind,
        upstreamVersion: dto.upstreamVersion.trim(),
        revision: dto.revision ?? 1,
        source,
        status: 'DRAFT',
        builtFromAppVersion: dto.builtFromAppVersion?.trim() || null,
        compatibilityJson: normalizedCompatibility ?? '{}',
        notes: dto.notes?.trim() || null
      }
    });
    const existing = await this.prisma.binaryAsset.findUnique({ where: { releaseId_target: { releaseId: release.id, target: dto.target } } });
    if (existing && release.status !== 'DRAFT') throw new ConflictException('ACTIVE 或历史资源不能覆盖平台资产，请提高 revision');
    const filename = this.sanitizeFilename(dto.filename || this.defaultFilename(dto.target));
    const finalRelativePath = join('resources', release.id, dto.target, filename);
    const finalPath = join(this.runtimeDir, finalRelativePath);
    await this.writeAtomically(finalPath, body);
    const asset = existing
      ? await this.prisma.binaryAsset.update({
          where: { id: existing.id },
          data: { filename, storageRoot: 'RUNTIME', storagePath: finalRelativePath, sha256: actual, size: body.length, available: true }
        })
      : await this.prisma.binaryAsset.create({
          data: {
            releaseId: release.id,
            target: dto.target,
            os: targetParts[1],
            arch: targetParts[2],
            filename,
            storageRoot: 'RUNTIME',
            storagePath: finalRelativePath,
            sha256: actual,
            size: body.length,
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
        storagePath: finalRelativePath,
        sha256: actual,
        size: body.length
      }
    });
    await this.audit('RESOURCE_IMPORTED', {
      releaseId: release.id,
      assetId: asset.id,
      operatorId,
      metadataJson: JSON.stringify({ source, target: dto.target })
    });
    await this.binaries.refresh();
    return this.detail(release.id);
  }

  // 读取运行态与静态仓 manifest 并认领资源；返回本轮成功认领的资源键集合，
  // 供归档逻辑判断“当前部署应存在的内置资源”。staticManifestLoaded 表示镜像/发行包自带
  // 的主 manifest 是否解析成功——它缺失或损坏时不得触发自动归档，避免误伤全部内置资源。
  private async syncManifests(): Promise<{ keys: Set<string>; staticManifestLoaded: boolean }> {
    const keys = new Set<string>();
    let staticManifestLoaded = false;
    for (const root of [this.runtimeDir, this.staticDir]) {
      const path = join(root, 'manifest.json');
      try {
        const parsed = JSON.parse(await readFile(path, 'utf8')) as BinaryManifest;
        if (root === this.staticDir) staticManifestLoaded = true;
        for (const resource of parsed.resources ?? []) {
          await this.upsertManifestResource(root, resource);
          keys.add(this.manifestKey(resource.kind, resource.upstreamVersion, resource.revision));
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
          this.logger.warn(`读取二进制 manifest 失败 root=${root}: ${error instanceof Error ? error.message : error}`);
        }
      }
    }
    return { keys, staticManifestLoaded };
  }

  private manifestKey(kind: string, upstreamVersion: string, revision?: number): string {
    return `${kind}:${upstreamVersion}:${revision ?? 1}`;
  }

  // 升级镜像/发行包后，旧内置资源指向的 STATIC 文件已被新版本替换（sha256 失配），
  // 保留“启用”状态只会误导管理员。这里把不在当前 manifest 中的 BUILTIN 资源自动归档：
  // 记录与审计全部保留、可手动恢复，默认标记按既有规则转移。
  private async retireSupersededBuiltins(manifest: { keys: Set<string>; staticManifestLoaded: boolean }): Promise<void> {
    if (!manifest.staticManifestLoaded) return;
    const builtins = await this.prisma.binaryRelease.findMany({ where: { source: 'BUILTIN', status: { not: 'RETIRED' } } });
    for (const release of builtins) {
      if (manifest.keys.has(this.manifestKey(release.kind, release.upstreamVersion, release.revision))) continue;
      const { defaultTransferredTo } = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.binaryRelease.update({ where: { id: release.id }, data: { status: 'RETIRED', isDefault: false } });
        const transferredTo = await this.transferDefault(tx, release);
        return { updated, defaultTransferredTo: transferredTo };
      });
      await this.audit('RESOURCE_RETIRED', {
        releaseId: release.id,
        metadataJson: JSON.stringify({ previousStatus: release.status, reason: 'builtin-superseded', defaultTransferredTo: defaultTransferredTo ?? null })
      });
      this.logger.log(`内置资源已被当前 manifest 取代，自动归档：${release.kind} ${release.upstreamVersion}-r${release.revision}`);
    }
  }

  // 收敛每类型唯一默认：多条时仅保留最新的 ACTIVE 默认，零条时补设最新 ACTIVE，
  // 修复历史版本重复登记 isDefault 造成的脏数据。
  private async normalizeDefaults(): Promise<void> {
    for (const kind of BINARY_KINDS) {
      const defaults = await this.prisma.binaryRelease.findMany({ where: { kind, isDefault: true }, orderBy: { updatedAt: 'desc' } });
      const keep = defaults.find((release) => release.status === 'ACTIVE');
      const staleIds = defaults.filter((release) => release.id !== keep?.id).map((release) => release.id);
      if (staleIds.length) {
        await this.prisma.binaryRelease.updateMany({ where: { id: { in: staleIds } }, data: { isDefault: false } });
      }
      if (!keep) {
        const candidate = await this.prisma.binaryRelease.findFirst({ where: { kind, status: 'ACTIVE' }, orderBy: { updatedAt: 'desc' } });
        if (candidate) await this.prisma.binaryRelease.update({ where: { id: candidate.id }, data: { isDefault: true } });
      }
    }
  }

  // 启动校验资产文件：缺失或 sha256 与登记不符的资产标记不可用（文件恢复后自愈回 true），
  // 启用中资源失去全部可用资产时降级为停用并转移默认，避免列表误导与误分发。
  private async verifyAssetsAvailability(): Promise<void> {
    const releases = await this.prisma.binaryRelease.findMany({
      where: { status: { in: ['ACTIVE', 'DRAFT'] } },
      include: { assets: { include: { files: true } } }
    });
    for (const release of releases) {
      let availableAssets = 0;
      for (const asset of release.assets) {
        const main = asset.files.find((file) => file.role === 'main') ?? asset.files[0];
        const path = this.resolveStoredPath(main?.storageRoot ?? asset.storageRoot, main?.storagePath ?? asset.storagePath);
        const inspected = await this.inspectFile(path);
        const expectedSha256 = (main?.sha256 ?? asset.sha256).toLowerCase();
        const valid = inspected ? inspected.sha256.toLowerCase() === expectedSha256 : false;
        if (valid !== asset.available) {
          await this.prisma.binaryAsset.update({ where: { id: asset.id }, data: { available: valid } });
          if (!valid) {
            this.logger.warn(`资产文件校验失败，已标记不可用：${release.kind} ${release.upstreamVersion}-r${release.revision} target=${asset.target}`);
          }
        }
        if (valid) availableAssets += 1;
      }
      if (release.status === 'ACTIVE' && release.assets.length > 0 && availableAssets === 0) {
        const { defaultTransferredTo } = await this.prisma.$transaction(async (tx) => {
          const updated = await tx.binaryRelease.update({ where: { id: release.id }, data: { status: 'DISABLED', isDefault: false } });
          const transferredTo = await this.transferDefault(tx, release);
          return { updated, defaultTransferredTo: transferredTo };
        });
        await this.audit('RESOURCE_DISABLED', {
          releaseId: release.id,
          metadataJson: JSON.stringify({ reason: 'asset-missing', defaultTransferredTo: defaultTransferredTo ?? null })
        });
        this.logger.warn(`资源已无可用资产文件，自动停用：${release.kind} ${release.upstreamVersion}-r${release.revision}`);
      }
    }
  }

  private async upsertManifestResource(root: string, resource: ManifestResource): Promise<void> {
    if (!BINARY_KINDS.includes(resource.kind) || !resource.upstreamVersion || !resource.assets?.length) return;
    const where = {
      kind_upstreamVersion_revision: {
        kind: resource.kind,
        upstreamVersion: resource.upstreamVersion,
        revision: resource.revision ?? 1
      }
    };
    const existing = await this.prisma.binaryRelease.findUnique({ where });
    const manifestCompatibility = this.manifestCompatibility(resource);
    const release = existing
      ? await this.prisma.binaryRelease.update({
          where: { id: existing.id },
          data: {
            source: resource.source ?? existing.source,
            builtFromAppVersion: resource.builtFromAppVersion ?? existing.builtFromAppVersion,
            ...(manifestCompatibility !== undefined ? { compatibilityJson: manifestCompatibility } : {}),
            ...(resource.notes !== undefined ? { notes: resource.notes } : {})
          }
        })
      : await this.prisma.binaryRelease.create({
          data: {
            kind: resource.kind,
            upstreamVersion: resource.upstreamVersion,
            revision: resource.revision ?? 1,
            source: resource.source ?? 'BUILTIN',
            status: resource.status ?? 'ACTIVE',
            builtFromAppVersion: resource.builtFromAppVersion ?? null,
            compatibilityJson: manifestCompatibility ?? '{}',
            notes: resource.notes ?? null,
            isDefault: resource.isDefault ?? false
          }
        });
    for (const item of resource.assets) {
      const targetParts = item.target.split('-');
      if (targetParts.length !== 3 || !item.files.length) continue;
      const files = [];
      for (const file of item.files) {
        const path = resolve(root, file.path);
        const inspected = await this.inspectFile(path);
        if (!inspected || (file.sha256 && inspected.sha256.toLowerCase() !== file.sha256.toLowerCase())) continue;
        files.push({ ...file, path, inspected });
      }
      const main = files.find((file) => file.role === 'main') ?? files[0];
      if (!main) continue;
      const relativePath = this.relativeStoragePath(root, main.path);
      const asset = await this.prisma.binaryAsset.upsert({
        where: { releaseId_target: { releaseId: release.id, target: item.target } },
        update: {
          os: item.os ?? targetParts[1],
          arch: item.arch ?? targetParts[2],
          filename: main.name,
          storageRoot: root === this.staticDir ? 'STATIC' : 'RUNTIME',
          storagePath: relativePath,
          sha256: main.inspected.sha256,
          size: main.inspected.size,
          available: true
        },
        create: {
          releaseId: release.id,
          target: item.target,
          os: item.os ?? targetParts[1],
          arch: item.arch ?? targetParts[2],
          filename: main.name,
          storageRoot: root === this.staticDir ? 'STATIC' : 'RUNTIME',
          storagePath: relativePath,
          sha256: main.inspected.sha256,
          size: main.inspected.size,
          available: true
        }
      });
      await this.prisma.binaryAssetFile.deleteMany({ where: { assetId: asset.id } });
      await this.prisma.binaryAssetFile.createMany({
        data: files.map((file) => ({
          assetId: asset.id,
          name: file.name,
          role: file.role ?? 'auxiliary',
          storageRoot: root === this.staticDir ? 'STATIC' : 'RUNTIME',
          storagePath: this.relativeStoragePath(root, file.path),
          sha256: file.inspected.sha256,
          size: file.inspected.size
        }))
      });
    }
  }

  private async syncLegacyAssets(): Promise<void> {
    for (const target of BINARY_TARGET_VALUES) {
      let asset;
      try {
        asset = this.binaries.getAsset(target);
      } catch {
        continue;
      }
      const existing = await this.prisma.binaryAsset.findFirst({ where: { target, sha256: asset.sha256 } });
      if (existing) continue;
      const kind = target.startsWith('agent-') ? 'AGENT' : 'SINGBOX';
      const version = kind === 'SINGBOX'
        ? await this.detectBinaryVersion(asset.path) || process.env.SINGBOX_VERSION || '1.14.0'
        : this.readAppVersion();
      const release = await this.prisma.binaryRelease.upsert({
        where: { kind_upstreamVersion_revision: { kind, upstreamVersion: version, revision: 1 } },
        update: {},
        create: { kind, upstreamVersion: version, revision: 1, source: 'BUILTIN', status: 'ACTIVE', isDefault: true, builtFromAppVersion: this.readAppVersion() }
      });
      const storageRoot = asset.path.includes(this.staticDir) ? 'STATIC' : 'RUNTIME';
      const storagePath = this.relativeStoragePath(storageRoot === 'STATIC' ? this.staticDir : this.runtimeDir, asset.path);
      const created = await this.prisma.binaryAsset.upsert({
        where: { releaseId_target: { releaseId: release.id, target } },
        update: {},
        create: {
          releaseId: release.id,
          target,
          os: target.split('-')[1],
          arch: target.split('-')[2],
          filename: asset.filename,
          storageRoot,
          storagePath,
          sha256: asset.sha256,
          size: asset.size,
          available: true
        }
      });
      if (created.sha256.toLowerCase() !== asset.sha256.toLowerCase()) {
        this.logger.warn(`legacy asset skipped: target=${target} release=${release.id} existing checksum differs`);
        continue;
      }
      await this.prisma.binaryAssetFile.create({
        data: { assetId: created.id, name: asset.filename, role: 'main', storageRoot, storagePath, sha256: asset.sha256, size: asset.size }
      });
      if (kind === 'SINGBOX' && target.startsWith('singbox-linux-')) {
        const auxiliaryPath = join(dirname(asset.path), 'libcronet.so');
        const auxiliary = await this.inspectFile(auxiliaryPath);
        if (auxiliary) {
          const auxiliaryRoot = auxiliaryPath.includes(this.staticDir) ? 'STATIC' : 'RUNTIME';
          await this.prisma.binaryAssetFile.create({
            data: {
              assetId: created.id,
              name: 'libcronet.so',
              role: 'auxiliary',
              storageRoot: auxiliaryRoot,
              storagePath: this.relativeStoragePath(auxiliaryRoot === 'STATIC' ? this.staticDir : this.runtimeDir, auxiliaryPath),
              sha256: auxiliary.sha256,
              size: auxiliary.size
            }
          });
        }
      }
    }
  }

  private async requireRelease(id: string) {
    const release = await this.prisma.binaryRelease.findUnique({ where: { id } });
    if (!release) throw new NotFoundException('二进制资源不存在');
    return release;
  }

  private async audit(action: string, values: { releaseId?: string; assetId?: string; taskId?: string; nodeId?: string; operatorId?: string; metadataJson?: string }) {
    await this.prisma.binaryAuditLog.create({ data: { action, ...values } });
  }

  private serializeRelease(release: {
    [key: string]: unknown;
    upstreamVersion: string;
    revision: number;
    _count?: { deploymentTasks?: number };
    deploymentTasks?: unknown[];
  }) {
    return {
      ...release,
      version: this.versionOf(release),
      deploymentCount: release._count?.deploymentTasks ?? release.deploymentTasks?.length ?? 0
    };
  }

  private versionOf(release: { upstreamVersion: string; revision: number }) {
    return `${release.upstreamVersion}-r${release.revision}`;
  }

  private parseCompatibility(value: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(value || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }

  private manifestCompatibility(resource: ManifestResource): string | undefined {
    const hasCompatibility = resource.compatibilityJson !== undefined;
    const compatibility = typeof resource.compatibilityJson === 'string'
      ? this.parseCompatibility(resource.compatibilityJson)
      : { ...(resource.compatibilityJson ?? {}) };
    if (resource.cronetVersion) compatibility.cronetVersion = resource.cronetVersion;
    return hasCompatibility || resource.cronetVersion ? JSON.stringify(compatibility) : undefined;
  }

  private assertCompatible(compatibility: Record<string, unknown>, node?: { agentProtocolVersion?: number | null; agentVersion?: string | null }) {
    const minProtocol = typeof compatibility.minAgentProtocolVersion === 'number' ? compatibility.minAgentProtocolVersion : undefined;
    const maxProtocol = typeof compatibility.maxAgentProtocolVersion === 'number' ? compatibility.maxAgentProtocolVersion : undefined;
    if (minProtocol !== undefined && (node?.agentProtocolVersion ?? 0) < minProtocol) {
      throw new ConflictException(`节点 Agent 协议版本过低，要求 >= ${minProtocol}`);
    }
    if (maxProtocol !== undefined && (node?.agentProtocolVersion ?? Number.MAX_SAFE_INTEGER) > maxProtocol) {
      throw new ConflictException(`节点 Agent 协议版本过高，要求 <= ${maxProtocol}`);
    }
    const minAgentVersion = typeof compatibility.minAgentVersion === 'string' ? compatibility.minAgentVersion : undefined;
    const maxAgentVersion = typeof compatibility.maxAgentVersion === 'string' ? compatibility.maxAgentVersion : undefined;
    if ((minAgentVersion || maxAgentVersion) && !node?.agentVersion) {
      throw new ConflictException('节点尚未上报 Agent 版本，无法完成资源兼容性检查');
    }
    if (minAgentVersion && compareVersions(node?.agentVersion ?? '', minAgentVersion) < 0) {
      throw new ConflictException(`节点 Agent 版本过低，要求 >= ${minAgentVersion}`);
    }
    if (maxAgentVersion && compareVersions(node?.agentVersion ?? '', maxAgentVersion) > 0) {
      throw new ConflictException(`节点 Agent 版本过高，要求 <= ${maxAgentVersion}`);
    }
  }

  private async writeAtomically(path: string, body: Buffer): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, body, { mode: 0o755 });
      await chmod(temp, 0o755);
      await rename(temp, path);
    } finally {
      await unlink(temp).catch(() => undefined);
    }
  }

  private async inspectFile(path: string): Promise<{ sha256: string; size: number } | undefined> {
    try {
      const metadata = await stat(path);
      if (!metadata.isFile() || metadata.size > MAX_BINARY_SIZE) return undefined;
      const hash = createHash('sha256');
      const body = await readFile(path);
      hash.update(body);
      return { sha256: hash.digest('hex'), size: metadata.size };
    } catch {
      return undefined;
    }
  }

  private async assertFile(path: string): Promise<void> {
    try {
      await access(path);
    } catch {
      throw new NotFoundException('二进制文件已缺失');
    }
  }

  private resolveStoredPath(root: string, path: string): string {
    if (isAbsolute(path)) return resolve(path);
    return resolve(root === 'STATIC' ? this.staticDir : this.runtimeDir, path);
  }

  private relativeStoragePath(root: string, path: string): string {
    const value = relative(root, path);
    return value && !value.startsWith('..') && !isAbsolute(value) ? value : path;
  }

  private defaultFilename(target: string): string {
    return target.endsWith('windows-amd64') ? (target.startsWith('agent-') ? 'riri-agent.exe' : 'sing-box.exe') : target.startsWith('agent-') ? 'riri-agent' : 'sing-box';
  }

  private sanitizeFilename(filename: string): string {
    const normalized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return normalized || 'binary';
  }

  private readAppVersion(): string {
    try {
      return JSON.parse(readFileSync(join(process.cwd(), '..', '..', 'package.json'), 'utf8')).version ?? '0.0.0';
    } catch {
      return process.env.npm_package_version ?? '0.0.0';
    }
  }

  private async detectBinaryVersion(path: string): Promise<string | undefined> {
    try {
      const result = await execFile(path, ['version'], { timeout: 2_000, windowsHide: true });
      return result.stdout.match(/\b\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?\b/)?.[0];
    } catch {
      return undefined;
    }
  }
}

function compareVersions(left: string, right: string): number {
  const parse = (value: string) => value.replace(/^v/i, '').split(/[+-]/, 1)[0].split('.').map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}
