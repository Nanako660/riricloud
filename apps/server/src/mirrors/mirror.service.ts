import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AgentService, type MirrorStreamHandlers } from '../agent-gateway/agent.service';
import { RateLimitService } from '../common/rate-limit.service';
import { assertSafeRemoteUrl } from '../common/safe-remote-fetch';
import { CreateMirrorSiteDto, UpdateMirrorSiteDto } from './dto/mirror-site.dto';

const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_RESPONSE_BYTES = 256 * 1024 * 1024;
const PUBLIC_RATE_LIMIT = 60;

type MirrorRecord = {
  id: string;
  name: string;
  slug: string;
  enabled: boolean;
  upstreamBaseUrl: string;
  allowedOriginsJson: string;
  nodeId: string;
  accessMode: string;
  shareTokenHash: string | null;
  shareExpiresAt: Date | null;
  shareRotatedAt: Date | null;
  lastRequestAt: Date | null;
  lastStatusCode: number | null;
  lastErrorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  node: { id: string; name: string; status: string; communicationMode: string; capabilitiesJson: string };
};

type MirrorWriteInput = {
  name?: string;
  slug?: string;
  enabled?: boolean;
  upstreamBaseUrl?: string;
  allowedOriginsJson?: string;
  nodeId?: string;
  accessMode?: 'ADMIN' | 'SHARE' | 'PUBLIC';
  shareExpiresAt?: Date | null;
};

@Injectable()
export class MirrorService {
  private readonly logger = new Logger(MirrorService.name);
  private readonly activeTaskIds = new Map<string, Set<string>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: AgentService,
    private readonly rateLimit: RateLimitService
  ) {}

  async list(page = 1, pageSize = 50) {
    const [sites, total] = await Promise.all([
      this.prisma.mirrorSite.findMany({
        include: { node: { select: { id: true, name: true, status: true, communicationMode: true, capabilitiesJson: true } } },
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.mirrorSite.count()
    ]);
    return { items: sites.map((site) => this.sanitize(site as MirrorRecord)), total, page, pageSize };
  }

  async detail(id: string) {
    const site = await this.findById(id);
    return { mirror: this.sanitize(site) };
  }

  async create(dto: CreateMirrorSiteDto) {
    const normalized = await this.normalizeInput(dto);
    if (!normalized.nodeId || !normalized.name || !normalized.slug || !normalized.upstreamBaseUrl || !normalized.allowedOriginsJson || !normalized.accessMode) throw new BadRequestException('镜像站参数不完整');
    await this.requireNode(normalized.nodeId);
    const share = normalized.accessMode === 'SHARE' ? this.newShareToken() : undefined;
    try {
      const site = await this.prisma.mirrorSite.create({
        data: {
          name: normalized.name,
          slug: normalized.slug,
          enabled: normalized.enabled ?? false,
          upstreamBaseUrl: normalized.upstreamBaseUrl,
          allowedOriginsJson: normalized.allowedOriginsJson,
          nodeId: normalized.nodeId,
          accessMode: normalized.accessMode,
          ...(normalized.shareExpiresAt ? { shareExpiresAt: normalized.shareExpiresAt } : {}),
          ...(share ? { shareTokenHash: share.hash, shareRotatedAt: new Date() } : {})
        },
        include: { node: { select: { id: true, name: true, status: true, communicationMode: true, capabilitiesJson: true } } }
      });
      return { mirror: this.sanitize(site as MirrorRecord), ...(share ? { shareToken: share.token } : {}) };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('镜像 slug 已存在');
      throw error;
    }
  }

  async update(id: string, dto: UpdateMirrorSiteDto) {
    const current = await this.findById(id);
    const input = await this.normalizeInput(dto, current);
    if (input.nodeId) await this.requireNode(input.nodeId);
    this.cancelActiveTasks(current.id);
    const switchingToShare = input.accessMode === 'SHARE' && current.accessMode !== 'SHARE';
    const disablingShare = input.accessMode && input.accessMode !== 'SHARE';
    const share = switchingToShare ? this.newShareToken() : undefined;
    const site = await this.prisma.mirrorSite.update({
      where: { id },
      data: {
        ...input,
        ...(disablingShare ? { shareTokenHash: null, shareExpiresAt: null } : {}),
        ...(share ? { shareTokenHash: share.hash, shareRotatedAt: new Date() } : {})
      },
      include: { node: { select: { id: true, name: true, status: true, communicationMode: true, capabilitiesJson: true } } }
    });
    return { mirror: this.sanitize(site as MirrorRecord), ...(share ? { shareToken: share.token } : {}) };
  }

  async remove(id: string) {
    await this.findById(id);
    this.cancelActiveTasks(id);
    await this.prisma.mirrorSite.delete({ where: { id } });
    return { deleted: true, id };
  }

  async rotateShareToken(id: string) {
    const site = await this.findById(id);
    if (site.accessMode !== 'SHARE') throw new BadRequestException('只有 SHARE 模式可以轮换分享 Token');
    const share = this.newShareToken();
    await this.prisma.mirrorSite.update({ where: { id }, data: { shareTokenHash: share.hash, shareRotatedAt: new Date() } });
    return { mirrorId: id, shareToken: share.token };
  }

  async test(id: string) {
    const site = await this.findById(id);
    this.ensureNodeAvailable(site);
    const taskId = randomUUID();
    const startedAt = Date.now();
    return new Promise<Record<string, unknown>>((resolve) => {
      let settled = false;
      let cancel: () => void = () => undefined;
      const finish = (result: Record<string, unknown>) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        cancel();
        resolve({ ...result, latencyMs: Date.now() - startedAt, nodeId: site.nodeId });
      };
      const handlers: MirrorStreamHandlers = {
        onHeaders: (headers) => finish({ success: true, statusCode: headers.statusCode, finalHost: headers.finalHost }),
        onChunk: () => undefined,
        onEnd: (end) => finish({ success: end.success, bytes: end.bytes }),
        onError: (error) => finish({ success: false, code: error.code, message: error.message })
      };
      const timeout = setTimeout(() => finish({ success: false, code: 'TIMEOUT', message: '镜像测试超时' }), 30_000);
      void this.agent.startMirrorTask(site.nodeId, this.buildRequest(site, 'HEAD', '/', {}, taskId), handlers)
        .then((stop) => { cancel = stop; if (settled) stop(); })
        .catch((error: unknown) => finish({ success: false, code: 'START_FAILED', message: error instanceof Error ? error.message : '无法启动镜像测试' }));
    });
  }

  async proxy(siteSlug: string, shareToken: string | undefined, request: Request, response: Response, user?: { role?: string }) {
    const site = shareToken ? await this.findByShareToken(shareToken) : await this.findBySlug(siteSlug);
    this.checkAccess(site, shareToken, user);
    if (!site.enabled && user?.role !== 'ADMIN') throw new NotFoundException('镜像站不存在');
    if (!['GET', 'HEAD'].includes(request.method)) throw new BadRequestException('镜像站只支持 GET 和 HEAD');
    if (site.accessMode !== 'ADMIN') {
      const ip = request.ip || request.socket.remoteAddress || 'unknown';
      if (!this.rateLimit.consume(`${site.id}:${ip}`, PUBLIC_RATE_LIMIT, 60_000)) throw new ForbiddenException('镜像请求过于频繁');
    }
    this.ensureNodeAvailable(site);
    const taskId = randomUUID();
    const startedAt = Date.now();
    let headersSent = false;
    let ended = false;
    let finalHost = 'unknown';
    let bytesSent = 0;
    let cancel: () => void = () => undefined;
    const requestHeaders = this.forwardRequestHeaders(request);
    const path = typeof request.params?.path === 'string' ? request.params.path : '';
    const target = this.buildTargetUrl(site, path, request.originalUrl.includes('?') ? request.originalUrl.slice(request.originalUrl.indexOf('?')) : '');
    const finish = (success: boolean, statusCode?: number, errorCode?: string) => {
      this.untrackTask(site.id, taskId);
      void this.prisma.mirrorSite.update({ where: { id: site.id }, data: { lastRequestAt: new Date(), lastStatusCode: statusCode ?? null, lastErrorCode: errorCode ?? (success ? null : 'UPSTREAM_ERROR') } }).catch(() => undefined);
      this.agent.cancelMirrorTask(taskId);
      this.loggerRequest(site, statusCode, errorCode, Date.now() - startedAt, finalHost, bytesSent);
    };
    const handlers: MirrorStreamHandlers = {
      onHeaders: (headers) => {
        if (ended) return;
        headersSent = true;
        finalHost = headers.finalHost;
        response.statusCode = headers.statusCode;
        for (const [key, value] of Object.entries(headers.headers)) response.setHeader(key, value);
      },
      onChunk: (chunk) => {
        if (!ended && !response.destroyed) {
          bytesSent += chunk.length;
          response.write(chunk);
        }
      },
      onEnd: (end) => {
        if (ended) return;
        bytesSent = end.bytes;
        ended = true;
        if (!headersSent) response.statusCode = end.success ? 200 : 502;
        response.end();
        finish(end.success, response.statusCode, end.success ? undefined : 'UPSTREAM_ERROR');
      },
      onError: (error) => {
        if (ended) return;
        ended = true;
        if (headersSent || response.headersSent) response.destroy();
        else response.status(502).json({ message: error.message, code: error.code });
        finish(false, headersSent ? response.statusCode : 502, error.code);
      }
    };
    const timeout = setTimeout(() => {
      if (!ended) {
        ended = true;
        cancel();
        if (!response.headersSent) response.status(504).json({ message: '镜像请求超时', code: 'TIMEOUT' });
        else response.destroy();
        finish(false, 504, 'TIMEOUT');
      }
    }, REQUEST_TIMEOUT_MS);
    response.on('close', () => {
      clearTimeout(timeout);
      if (!ended) { ended = true; cancel(); finish(false, response.statusCode, 'CLIENT_DISCONNECTED'); }
    });
    try {
      const stop = await this.agent.startMirrorTask(site.nodeId, { taskId, method: request.method as 'GET' | 'HEAD', url: target, allowedHosts: this.parseOrigins(site.allowedOriginsJson), requestHeaders, timeoutMs: REQUEST_TIMEOUT_MS, maxBytes: MAX_RESPONSE_BYTES }, handlers);
      cancel = stop;
      this.trackTask(site.id, taskId);
      if (ended) stop();
    } catch (error) {
      clearTimeout(timeout);
      if (!response.headersSent) throw error;
      response.destroy();
    }
  }

  private loggerRequest(site: MirrorRecord, statusCode: number | undefined, errorCode: string | undefined, durationMs: number, finalHost: string, bytes: number) {
    const fields = `site=${site.id} node=${site.nodeId} host=${finalHost} status=${statusCode ?? 'none'} bytes=${bytes} durationMs=${durationMs} error=${errorCode ?? 'none'}`;
    if (errorCode) this.logger.warn(`mirror request failed ${fields}`);
    else this.logger.log(`mirror request completed ${fields}`);
  }

  private trackTask(siteId: string, taskId: string) {
    const tasks = this.activeTaskIds.get(siteId) ?? new Set<string>();
    tasks.add(taskId);
    this.activeTaskIds.set(siteId, tasks);
  }

  private untrackTask(siteId: string, taskId: string) {
    const tasks = this.activeTaskIds.get(siteId);
    if (!tasks) return;
    tasks.delete(taskId);
    if (!tasks.size) this.activeTaskIds.delete(siteId);
  }

  private cancelActiveTasks(siteId: string) {
    const tasks = this.activeTaskIds.get(siteId);
    if (!tasks) return;
    for (const taskId of tasks) this.agent.cancelMirrorTask(taskId);
    this.activeTaskIds.delete(siteId);
  }

  private async normalizeInput(dto: CreateMirrorSiteDto | UpdateMirrorSiteDto, current?: MirrorRecord): Promise<MirrorWriteInput> {
    const result: MirrorWriteInput = {};
    if ('name' in dto && dto.name !== undefined) { const name = dto.name.trim(); if (!name) throw new BadRequestException('镜像名称不能为空'); result.name = name; }
    if ('slug' in dto && dto.slug !== undefined) result.slug = dto.slug.trim().toLowerCase();
    if ('upstreamBaseUrl' in dto && dto.upstreamBaseUrl !== undefined) result.upstreamBaseUrl = this.normalizeBaseUrl(dto.upstreamBaseUrl);
    if ('allowedOrigins' in dto && dto.allowedOrigins !== undefined) result.allowedOriginsJson = JSON.stringify(this.normalizeOrigins(dto.allowedOrigins));
    if ('nodeId' in dto && dto.nodeId !== undefined) result.nodeId = dto.nodeId;
    if ('accessMode' in dto && dto.accessMode !== undefined) result.accessMode = dto.accessMode;
    if ('enabled' in dto && dto.enabled !== undefined) result.enabled = dto.enabled;
    if ('shareExpiresAt' in dto && dto.shareExpiresAt !== undefined) result.shareExpiresAt = dto.shareExpiresAt ? new Date(dto.shareExpiresAt) : null;
    const upstream = result.upstreamBaseUrl ?? current?.upstreamBaseUrl;
    if (upstream) {
      await assertSafeRemoteUrl(upstream, true);
      const parsed = new URL(upstream);
      const origins = result.allowedOriginsJson ? this.parseOrigins(result.allowedOriginsJson) : current ? this.parseOrigins(current.allowedOriginsJson) : [parsed.hostname];
      if (!origins.includes(parsed.hostname.toLowerCase())) throw new BadRequestException('允许域名必须包含上游基址域名');
    }
    if (!current && (!result.name || !result.slug || !result.upstreamBaseUrl || !result.allowedOriginsJson || !result.nodeId || !result.accessMode)) throw new BadRequestException('镜像站参数不完整');
    if (result.accessMode === 'SHARE' && result.shareExpiresAt && new Date(result.shareExpiresAt as Date).getTime() <= Date.now()) throw new BadRequestException('分享 Token 过期时间必须在未来');
    return result;
  }

  private normalizeBaseUrl(raw: string): string {
    let parsed: URL;
    try { parsed = new URL(raw.trim()); } catch { throw new BadRequestException('上游基址不是合法 URL'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new BadRequestException('上游基址必须是无凭据的 HTTP/HTTPS URL');
    if (this.productionLike() && parsed.protocol !== 'https:') throw new BadRequestException('生产环境镜像上游必须使用 HTTPS');
    parsed.pathname = parsed.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
    return parsed.toString().replace(/\/$/, '');
  }

  private normalizeOrigins(origins: string[]): string[] {
    const result = [...new Set(origins.map((origin) => origin.trim().toLowerCase().replace(/^\*\./, '')).filter(Boolean))];
    if (!result.length || result.some((origin) => !/^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/.test(origin))) throw new BadRequestException('允许域名格式无效');
    return result;
  }

  private buildTargetUrl(site: MirrorRecord, path: string, query: string): string {
    if (path.includes('\0') || path.includes('\\')) throw new BadRequestException('镜像路径无效');
    if (path.split('/').some((segment) => segment === '.' || segment === '..')) throw new BadRequestException('镜像路径无效');
    const base = site.upstreamBaseUrl.endsWith('/') ? site.upstreamBaseUrl : `${site.upstreamBaseUrl}/`;
    const safePath = path.replace(/^\/+/, '');
    const target = new URL(safePath, base);
    if (target.hostname !== new URL(site.upstreamBaseUrl).hostname) throw new BadRequestException('镜像路径不能切换主机');
    target.search = query || '';
    return target.toString();
  }

  private buildRequest(site: MirrorRecord, method: 'GET' | 'HEAD', path: string, headers: Record<string, string>, taskId: string) {
    return { taskId, method, url: this.buildTargetUrl(site, path, ''), allowedHosts: this.parseOrigins(site.allowedOriginsJson), requestHeaders: headers, timeoutMs: 30_000, maxBytes: MAX_RESPONSE_BYTES };
  }

  private forwardRequestHeaders(request: Request): Record<string, string> {
    const result: Record<string, string> = {};
    for (const key of ['range', 'if-none-match', 'if-modified-since', 'if-range', 'accept', 'accept-encoding']) {
      const value = request.headers[key];
      if (typeof value === 'string') result[key] = value.slice(0, 4096);
    }
    return result;
  }

  private checkAccess(site: MirrorRecord, token: string | undefined, user?: { role?: string }) {
    if (site.accessMode === 'ADMIN' && user?.role !== 'ADMIN') throw new ForbiddenException('需要管理员权限');
    if (site.accessMode === 'SHARE' && (!token || !site.shareTokenHash || site.shareExpiresAt && site.shareExpiresAt.getTime() <= Date.now())) throw new ForbiddenException('分享地址已失效');
  }

  private ensureNodeAvailable(site: MirrorRecord) {
    if (site.node.status !== 'ONLINE' || site.node.communicationMode !== 'WS' || !this.parseCapabilities(site.node.capabilitiesJson).includes('mirror_proxy')) throw new ConflictException('指定节点未在线或不支持镜像代理');
  }

  private async findById(id: string): Promise<MirrorRecord> {
    const site = await this.prisma.mirrorSite.findUnique({ where: { id }, include: { node: { select: { id: true, name: true, status: true, communicationMode: true, capabilitiesJson: true } } } });
    if (!site) throw new NotFoundException('镜像站不存在');
    return site as MirrorRecord;
  }

  private async findBySlug(slug: string): Promise<MirrorRecord> {
    const site = await this.prisma.mirrorSite.findUnique({ where: { slug }, include: { node: { select: { id: true, name: true, status: true, communicationMode: true, capabilitiesJson: true } } } });
    if (!site) throw new NotFoundException('镜像站不存在');
    return site as MirrorRecord;
  }

  private async findByShareToken(token: string): Promise<MirrorRecord> {
    const hash = this.hashToken(token);
    const site = await this.prisma.mirrorSite.findUnique({ where: { shareTokenHash: hash }, include: { node: { select: { id: true, name: true, status: true, communicationMode: true, capabilitiesJson: true } } } });
    if (!site) throw new ForbiddenException('分享地址已失效');
    return site as MirrorRecord;
  }

  private async requireNode(id: string) {
    const node = await this.prisma.node.findUnique({ where: { id }, select: { id: true, status: true, communicationMode: true, capabilitiesJson: true } });
    if (!node) throw new BadRequestException('指定节点不存在');
    if (node.status !== 'ONLINE' || node.communicationMode !== 'WS' || !this.parseCapabilities(node.capabilitiesJson).includes('mirror_proxy')) {
      throw new ConflictException('指定节点未在线或不支持镜像代理');
    }
  }

  private sanitize(site: MirrorRecord) {
    return {
      id: site.id, name: site.name, slug: site.slug, enabled: site.enabled, upstreamBaseUrl: site.upstreamBaseUrl,
      allowedOrigins: this.parseOrigins(site.allowedOriginsJson), nodeId: site.nodeId, accessMode: site.accessMode,
      shareExpiresAt: site.shareExpiresAt, shareRotatedAt: site.shareRotatedAt, lastRequestAt: site.lastRequestAt,
      lastStatusCode: site.lastStatusCode, lastErrorCode: site.lastErrorCode, createdAt: site.createdAt, updatedAt: site.updatedAt,
      node: { ...site.node, capabilities: this.parseCapabilities(site.node.capabilitiesJson), supportsMirrorProxy: this.parseCapabilities(site.node.capabilitiesJson).includes('mirror_proxy') }
    };
  }

  private parseOrigins(raw: string): string[] { try { const value: unknown = JSON.parse(raw); return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; } catch { return []; } }
  private parseCapabilities(raw: string): string[] { try { const value: unknown = JSON.parse(raw); return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; } catch { return []; } }
  private hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
  private newShareToken() { const token = randomBytes(32).toString('base64url'); return { token, hash: this.hashToken(token) }; }
  private productionLike() { return process.env.NODE_ENV === 'production' || process.env.RIRICLOUD_ENV === 'production'; }
}
