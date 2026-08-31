import { Injectable, NotFoundException, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, readFileSync } from 'node:fs';
import { access, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import type { ImportBinaryDto } from './dto/import-binary.dto';

const MAX_BINARY_SIZE = 100 * 1024 * 1024;
const TARGETS = [
  { target: 'agent-linux-amd64', kind: 'agent', os: 'linux', arch: 'amd64', filename: 'riri-agent' },
  { target: 'agent-linux-arm64', kind: 'agent', os: 'linux', arch: 'arm64', filename: 'riri-agent' },
  { target: 'agent-windows-amd64', kind: 'agent', os: 'windows', arch: 'amd64', filename: 'riri-agent.exe' },
  { target: 'singbox-linux-amd64', kind: 'singbox', os: 'linux', arch: 'amd64', filename: 'sing-box' },
  { target: 'singbox-linux-arm64', kind: 'singbox', os: 'linux', arch: 'arm64', filename: 'sing-box' },
  { target: 'singbox-windows-amd64', kind: 'singbox', os: 'windows', arch: 'amd64', filename: 'sing-box.exe' }
] as const;

export type BinaryTarget = (typeof TARGETS)[number]['target'];
export type BinaryKind = (typeof TARGETS)[number]['kind'];

export type BinaryAsset = {
  target: BinaryTarget;
  kind: BinaryKind;
  os: string;
  arch: string;
  filename: string;
  version: string;
  path: string;
  sha256: string;
  size: number;
  imported: boolean;
};

type BinaryInfo = Omit<BinaryAsset, 'path'> & { available: boolean };

@Injectable()
export class BinariesService implements OnModuleInit {
  private readonly assets = new Map<BinaryTarget, BinaryAsset>();
  private readonly customDir = resolve(process.env.RIRICLOUD_BINARY_DIR ?? join(process.cwd(), 'binaries'), 'custom');
  private refreshedAt: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const next = new Map<BinaryTarget, BinaryAsset>();
    const version = this.readMasterVersion();
    for (const definition of TARGETS) {
      const candidate = await this.findCandidate(definition.target, version);
      if (!candidate) continue;
      const file = await this.inspectFile(candidate.path);
      if (!file) continue;
      next.set(definition.target, {
        ...definition,
        version: candidate.version ?? version,
        path: candidate.path,
        sha256: file.sha256,
        size: file.size,
        imported: candidate.imported
      });
    }
    this.assets.clear();
    next.forEach((asset, target) => this.assets.set(target, asset));
    this.refreshedAt = new Date().toISOString();
  }

  async getInfo() {
    await this.refresh();
    return {
      masterVersion: this.readMasterVersion(),
      refreshedAt: this.refreshedAt,
      targets: TARGETS.map((definition): BinaryInfo => {
        const asset = this.assets.get(definition.target);
        return asset
          ? this.toInfo(asset)
          : { ...definition, version: this.readMasterVersion(), sha256: '', size: 0, imported: false, available: false };
      })
    };
  }

  getAsset(target: string): BinaryAsset {
    const asset = this.assets.get(target as BinaryTarget);
    if (!asset) throw new NotFoundException('主控未找到该架构的内置二进制');
    return asset;
  }

  async authorizeDownload(token: string | undefined): Promise<void> {
    if (!token) throw new UnauthorizedException('缺少 AgentToken');
    const node = await this.prisma.node.findUnique({ where: { agentToken: token }, select: { status: true } });
    if (!node || node.status === 'DISABLED') throw new UnauthorizedException('无效的 AgentToken');
  }

  buildDownloadUrl(target: BinaryTarget, token: string): string {
    const base = (process.env.RIRICLOUD_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? '3000'}`).replace(/\/$/, '');
    return `${base}/api/v1/downloads/binaries/${target}?token=${encodeURIComponent(token)}`;
  }

  findForNode(kind: BinaryKind, osArch: string | null | undefined): BinaryAsset | undefined {
    const normalized = normalizeOsArch(osArch) ?? 'linux-amd64';
    return this.assets.get(`${kind}-${normalized}` as BinaryTarget);
  }

  async resolveForNode(kind: BinaryKind, osArch: string | null | undefined, token: string) {
    await this.refresh();
    const asset = this.findForNode(kind, osArch);
    if (!asset) throw new Error(`主控未内置 ${kind} 的 ${normalizeOsArch(osArch) ?? 'linux-amd64'} 版本`);
    return {
      version: asset.version,
      sha256: asset.sha256,
      url: this.buildDownloadUrl(asset.target, token)
    };
  }

  async importRemote(dto: ImportBinaryDto): Promise<BinaryInfo> {
    if (!/^https?:\/\//i.test(dto.url)) throw new Error('binary URL must use http or https');
    if (!/^[a-f0-9]{64}$/i.test(dto.sha256)) throw new Error('binary sha256 must be 64 hexadecimal characters');
    const response = await fetch(dto.url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`binary download failed: HTTP ${response.status}`);
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > MAX_BINARY_SIZE) throw new Error('binary file exceeds size limit');
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > MAX_BINARY_SIZE) throw new Error('binary file exceeds size limit');
    const actual = createHash('sha256').update(body).digest('hex');
    if (actual.toLowerCase() !== dto.sha256.toLowerCase()) throw new Error(`binary checksum mismatch: got ${actual}`);
    await mkdir(this.customDir, { recursive: true });
    const definition = TARGETS.find((item) => item.target === dto.target);
    if (!definition) throw new Error('unsupported binary target');
    const filename = `${dto.target}-${dto.version.replace(/[^a-zA-Z0-9._-]/g, '_')}-${randomUUID()}${definition.filename.endsWith('.exe') ? '.exe' : ''}`;
    const path = join(this.customDir, filename);
    await writeFile(path, body, { mode: 0o755 });
    await this.refresh();
    const asset = this.assets.get(dto.target);
    if (!asset) throw new Error('imported binary is unavailable after refresh');
    return this.toInfo(asset);
  }

  private async findCandidate(target: BinaryTarget, fallbackVersion: string): Promise<{ path: string; version?: string; imported: boolean } | undefined> {
    const definition = TARGETS.find((item) => item.target === target);
    if (!definition) return undefined;
    const custom = await this.findLatestCustom(target);
    if (custom) return custom;
    const roots = this.getRoots();
    const names = [definition.filename, target, `${definition.kind}-${definition.os}-${definition.arch}`];
    for (const root of roots) {
      for (const name of names) {
        const path = join(root, name);
        if (await this.isFile(path)) return { path, imported: false };
      }
      const versioned = join(root, `${definition.kind === 'agent' ? 'riri-agent' : 'sing-box'}_${fallbackVersion}_${definition.os}_${definition.arch}`, definition.filename);
      if (await this.isFile(versioned)) return { path: versioned, version: fallbackVersion, imported: false };
    }
    return undefined;
  }

  private async findLatestCustom(target: BinaryTarget): Promise<{ path: string; version?: string; imported: boolean } | undefined> {
    try {
      const entries = await readdir(this.customDir);
      const matches = entries.filter((entry) => entry.startsWith(`${target}-`));
      if (!matches.length) return undefined;
      matches.sort().reverse();
      const entry = matches[0];
      return { path: join(this.customDir, entry), version: entry.slice(`${target}-`.length).split('-')[0], imported: true };
    } catch {
      return undefined;
    }
  }

  private getRoots(): string[] {
    const configured = process.env.RIRICLOUD_BINARY_DIR;
    return [
      ...(configured ? [resolve(configured)] : []),
      resolve(process.cwd(), 'binaries'),
      resolve(process.cwd(), 'dist', 'binaries'),
      resolve(process.cwd(), '..', 'binaries'),
      resolve(process.cwd(), '..', '..', 'binaries'),
      resolve(process.cwd(), 'apps', 'agent'),
      resolve(process.cwd(), '.tools', 'sing-box'),
      resolve(process.cwd(), '.cache', 'release'),
      resolve(process.cwd(), '..', '..', '.cache', 'release')
    ];
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

  private async isFile(path: string): Promise<boolean> {
    try {
      await access(path);
      return (await stat(path)).isFile();
    } catch {
      return false;
    }
  }

  private toInfo(asset: BinaryAsset): BinaryInfo {
    const { path: _path, ...info } = asset;
    return { ...info, available: true };
  }

  private readMasterVersion(): string {
    const candidates = [join(process.cwd(), '..', '..', 'package.json'), join(process.cwd(), 'package.json')];
    for (const path of candidates) {
      try {
        return JSON.parse(readFileSync(path, 'utf8')).version ?? '0.0.0';
      } catch {
        // 尝试发行包或开发态的下一个路径
      }
    }
    return process.env.npm_package_version ?? '0.0.0';
  }
}

export function normalizeOsArch(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase().replace(/\\/g, '/').replace(/\s+/g, '');
  const [os, arch] = normalized.split('/');
  const osName = os === 'darwin' ? 'macos' : os;
  const archName = arch === 'x86_64' || arch === 'x64' ? 'amd64' : arch === 'aarch64' ? 'arm64' : arch;
  if (!['linux', 'windows', 'macos'].includes(osName) || !['amd64', 'arm64', 'armv7'].includes(archName)) return undefined;
  return `${osName}-${archName}`;
}
