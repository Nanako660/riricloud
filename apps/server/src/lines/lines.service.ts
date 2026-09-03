import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AgentService } from '../agent-gateway/agent.service';
import { normalizeInboundParams, sanitizeInboundParams } from '../common/inbound';
import {
  LINE_TYPES,
  PROTOCOL_TYPES,
  RELAY_MODES,
  LineStatus,
  LineType,
  ProtocolType,
  RelayMode
} from '../common/constants';
import { DEFAULT_INBOUND_LISTEN, findAvailableRandomPort } from '../common/ports';
import { resolveLineTags } from '../common/line-tags';
import { PrismaService } from '../prisma/prisma.service';
import { BatchLineStatusDto } from './dto/batch-line-status.dto';
import { CreateLineDto } from './dto/create-line.dto';
import { QueryLineDto } from './dto/query-line.dto';
import { ReorderLinesDto } from './dto/reorder-lines.dto';
import { UpdateLineDto } from './dto/update-line.dto';
import { SettingsService } from '../system/settings.service';
import { isLineAuthorized } from '../common/line-access';

const nodeSummary = { select: { id: true, name: true, serverHost: true, status: true, isLocal: true } } as const;
const certificateSummary = {
  select: { id: true, name: true, subject: true, issuer: true, sansJson: true, validFrom: true, validTo: true }
} as const;
const lineInclude = { entryNode: nodeSummary, exitNode: nodeSummary, certificate: certificateSummary } as const;
type LineWithRelations = Prisma.LineGetPayload<{ include: typeof lineInclude }>;

type LineInput = {
  name?: string;
  tag?: string | null;
  listen?: string;
  type?: LineType;
  protocolType?: ProtocolType;
  params?: Record<string, unknown>;
  relayMode?: RelayMode | null;
  entryNodeId?: string | null;
  entryPort?: number | null;
  exitNodeId?: string | null;
  exitPort?: number | null;
  certificateId?: string | null;
  endpointOverrideEnabled?: boolean;
  serverHost?: string | null;
  serverPort?: number | null;
  serverName?: string | null;
  host?: string | null;
  trafficRate?: number;
  tags?: string[];
  level?: number;
  sortOrder?: number;
  isPublic?: boolean;
  status?: LineStatus;
};

const UDP_PROTOCOLS = new Set<ProtocolType>(['HYSTERIA2', 'TUIC']);

@Injectable()
export class LinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentGateway: AgentService,
    @Optional() private readonly settingsService?: SettingsService
  ) {}

  async list(query: QueryLineDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.LineWhereInput = {
      ...(query.search ? { OR: [{ name: { contains: query.search } }, { serverHost: { contains: query.search } }] } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.isPublic !== undefined ? { isPublic: query.isPublic } : {})
    };
    const rows = await this.prisma.line.findMany({
      where,
      include: lineInclude,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
    });
    const filtered = query.tag ? rows.filter((line) => this.parseTags(line.tagsJson).includes(query.tag!.trim())) : rows;
    const data = filtered.slice((page - 1) * pageSize, page * pageSize).map((line) => this.toView(line));
    return { data, total: filtered.length, page, pageSize };
  }

  async detail(id: string) {
    return { line: this.toView(await this.findRaw(id)) };
  }

  async create(dto: CreateLineDto) {
    const prepared = await this.prepare(dto);
    const line = await this.prisma.line.create({ data: prepared as Prisma.LineUncheckedCreateInput, include: lineInclude });
    void this.agentGateway.pushConfigToAll();
    return { line: this.toView(line) };
  }

  async update(id: string, dto: UpdateLineDto) {
    const current = await this.findRaw(id);
    const prepared = await this.prepare(dto, current);
    const line = await this.prisma.line.update({ where: { id }, data: prepared as Prisma.LineUncheckedUpdateInput, include: lineInclude });
    void this.agentGateway.pushConfigToAll();
    return { line: this.toView(line) };
  }

  async remove(id: string) {
    await this.findRaw(id);
    await this.prisma.line.delete({ where: { id } });
    void this.agentGateway.pushConfigToAll();
    return { deleted: true, id };
  }

  async duplicate(id: string) {
    const current = await this.findRaw(id);
    const prepared = await this.prepare({
      name: `${current.name} 副本`,
      type: current.type as LineType,
      protocolType: current.protocolType as ProtocolType,
      params: this.parseObject(current.paramsJson),
      certificateId: current.certificateId,
      relayMode: current.relayMode as RelayMode | null,
      entryNodeId: current.entryNodeId,
      exitNodeId: current.exitNodeId,
      tags: this.parseTags(current.tagsJson),
      trafficRate: current.trafficRate,
      level: current.level,
      sortOrder: current.sortOrder + 1,
      isPublic: current.isPublic,
      status: 'DISABLED'
    });
    const line = await this.prisma.line.create({ data: prepared as Prisma.LineUncheckedCreateInput, include: lineInclude });
    void this.agentGateway.pushConfigToAll();
    return { line: this.toView(line) };
  }

  async batchStatus(dto: BatchLineStatusDto) {
    const result = await this.prisma.line.updateMany({ where: { id: { in: dto.ids } }, data: { status: dto.status } });
    void this.agentGateway.pushConfigToAll();
    return { updated: result.count, status: dto.status };
  }

  async reorder(dto: ReorderLinesDto) {
    await this.prisma.$transaction(
      dto.items.map((item) => this.prisma.line.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } }))
    );
    void this.agentGateway.pushConfigToAll();
    return { updated: dto.items.length };
  }

  async testResolve(id: string) {
    const line = await this.findRaw(id);
    const view = this.toView(line);
    return {
      line: view,
      endpoint: { serverHost: view.serverHost, serverPort: view.serverPort, serverName: view.serverName, host: view.host },
      entry: { nodeId: line.entryNodeId, nodeName: line.entryNode.name, port: line.entryPort },
      exit: { nodeId: line.exitNodeId, nodeName: line.exitNode.name, port: line.exitPort }
    };
  }

  async getAvailableForPlan(
    plan: { lineMatchMode: string; lineTagsJson: string; lineIdsJson: string },
    extraLineIds: string[] = []
  ) {
    const settings = await this.settingsService?.getSettings();
    if (settings?.publicLinesEnabled === false) return [];
    const extraIds = [...new Set(extraLineIds)];
    const rows = await this.prisma.line.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { isPublic: true },
          ...(extraIds.length ? [{ id: { in: extraIds } }] : [])
        ]
      },
      include: lineInclude,
      orderBy: [{ sortOrder: 'asc' }, { level: 'desc' }, { createdAt: 'asc' }]
    });
    return rows
      .filter((line) => line.status === undefined || line.status === 'ACTIVE')
      .filter((line) => line.entryNode.status === 'ONLINE' && line.exitNode.status === 'ONLINE')
      .filter((line) => isLineAuthorized(plan, line, extraIds))
      .map((line) => this.toView(line));
  }

  private async findRaw(id: string): Promise<LineWithRelations> {
    const line = await this.prisma.line.findUnique({ where: { id }, include: lineInclude });
    if (!line) throw new NotFoundException('线路不存在');
    return line;
  }

  private async prepare(input: LineInput, current?: LineWithRelations): Promise<Prisma.LineUncheckedCreateInput | Prisma.LineUncheckedUpdateInput> {
    const type = input.type ?? (current?.type as LineType | undefined) ?? 'DIRECT';
    if (!LINE_TYPES.includes(type)) throw new BadRequestException('线路类型无效');

    const protocolType = input.protocolType ?? (current?.protocolType as ProtocolType | undefined) ?? 'VLESS';
    if (!PROTOCOL_TYPES.includes(protocolType)) throw new BadRequestException('线路协议无效');
    const existingParams = current ? this.parseObject(current.paramsJson) : {};
    const certificateId = input.certificateId !== undefined ? input.certificateId : current?.certificateId ?? null;
    const certificate = certificateId
      ? await this.prisma.certificate.findUnique({ where: { id: certificateId } })
      : null;
    if (certificateId && !certificate) throw new NotFoundException('证书不存在');
    const mergedParams = this.deepMerge(existingParams, input.params ?? {});
    if (certificate) {
      mergedParams.tls = {
        ...this.parseObjectValue(mergedParams.tls),
        certificate: [certificate.certificatePem],
        key: [certificate.privateKeyPem]
      };
    }
    const params = normalizeInboundParams(protocolType, mergedParams);
    if (certificateId && (params.tls as { mode?: string } | undefined)?.mode !== 'tls') {
      throw new BadRequestException('证书只能关联标准 TLS 安全模式');
    }
    if (certificateId && params.tls && typeof params.tls === 'object') {
      delete (params.tls as Record<string, unknown>).certificate;
      delete (params.tls as Record<string, unknown>).key;
    }

    let entryNodeId = input.entryNodeId !== undefined ? input.entryNodeId : current?.entryNodeId;
    let exitNodeId = input.exitNodeId !== undefined ? input.exitNodeId : current?.exitNodeId;
    if (!entryNodeId) entryNodeId = exitNodeId;
    if (!exitNodeId) exitNodeId = entryNodeId;
    if (!entryNodeId || !exitNodeId) throw new BadRequestException('必须指定入口节点和出口节点');
    if (type === 'DIRECT' && entryNodeId !== exitNodeId) {
      throw new BadRequestException('直连线路的入口节点必须与出口节点一致');
    }
    const relayMode = type === 'RELAY' ? (input.relayMode ?? current?.relayMode) as RelayMode | null : null;
    if (type === 'RELAY' && (!relayMode || !RELAY_MODES.includes(relayMode))) {
      throw new BadRequestException('中继线路必须指定有效的中继机制');
    }
    if (type === 'RELAY' && relayMode === 'PROTOCOL_PROXY' && protocolType === 'SHADOWTLS') {
      throw new BadRequestException('ShadowTLS 仅支持直连或盲转发，不支持协议代理中继');
    }

    const [entryNode, exitNode] = await Promise.all([
      this.prisma.node.findUnique({ where: { id: entryNodeId } }),
      entryNodeId === exitNodeId ? Promise.resolve(null) : this.prisma.node.findUnique({ where: { id: exitNodeId } })
    ]);
    if (!entryNode) throw new NotFoundException('入口节点不存在');
    if (entryNodeId !== exitNodeId && !exitNode) throw new NotFoundException('出口节点不存在');

    const entryPort = input.entryPort !== undefined && input.entryPort !== null
      ? input.entryPort
      : current?.entryPort ?? await this.findAvailablePort(entryNodeId, protocolType, current?.id);
    const requestedExitPort = input.exitPort !== undefined && input.exitPort !== null ? input.exitPort : current?.exitPort;
    const exitPort = type === 'DIRECT'
      ? entryPort
      : requestedExitPort ?? await this.findAvailablePort(exitNodeId, protocolType, current?.id);
    if (type === 'DIRECT' && requestedExitPort !== undefined && requestedExitPort !== null && requestedExitPort !== entryPort) {
      throw new BadRequestException('直连线路的入口与出口端口必须一致');
    }
    if (type === 'RELAY' && entryNodeId === exitNodeId && entryPort === exitPort) {
      throw new BadRequestException('同节点中继线路的入口与出口端口必须不同');
    }
    await this.assertPortAvailable(entryNodeId, entryPort, protocolType, current?.id);
    if (type === 'RELAY' || exitNodeId !== entryNodeId || exitPort !== entryPort) {
      await this.assertPortAvailable(exitNodeId, exitPort, protocolType, current?.id);
    }

    const name = input.name !== undefined ? input.name.trim() : current?.name;
    if (!name) throw new BadRequestException('线路名称不能为空');
    const optionalText = (value: string | null | undefined, fallback: string | null | undefined) => {
      if (value === undefined) return fallback ?? null;
      if (value === null) return null;
      const trimmed = value.trim();
      return trimmed || null;
    };
    const tags = input.tags !== undefined
      ? input.tags.map((tag) => tag.trim()).filter(Boolean)
      : current ? this.parseTags(current.tagsJson) : [];
    const customTag = input.tag !== undefined
      ? input.tag?.trim() || null
      : current?.tag ?? null;
    const listen = input.listen !== undefined
      ? input.listen.trim()
      : current?.listen ?? DEFAULT_INBOUND_LISTEN;
    if (!listen) throw new BadRequestException('监听地址不能为空');
    await this.assertLineTagsAvailable({
      id: current?.id,
      tag: customTag,
      type,
      entryNodeId,
      exitNodeId
    });

    return {
      name,
      tag: customTag,
      listen,
      type,
      relayMode,
      protocolType,
      paramsJson: JSON.stringify(params),
      entryNodeId,
      entryPort,
      exitNodeId,
      exitPort,
      certificateId,
      endpointOverrideEnabled: input.endpointOverrideEnabled ?? current?.endpointOverrideEnabled ?? false,
      serverHost: optionalText(input.serverHost, current?.serverHost),
      serverPort: input.serverPort !== undefined ? input.serverPort : current?.serverPort,
      serverName: optionalText(input.serverName, current?.serverName),
      host: optionalText(input.host, current?.host),
      trafficRate: input.trafficRate ?? current?.trafficRate ?? 1,
      tagsJson: JSON.stringify(tags),
      level: input.level ?? current?.level ?? 0,
      sortOrder: input.sortOrder ?? current?.sortOrder ?? 0,
      isPublic: input.isPublic ?? current?.isPublic ?? true,
      status: input.status ?? current?.status ?? 'ACTIVE'
    };
  }

  private async assertPortAvailable(nodeId: string, port: number, protocolType: ProtocolType, currentId?: string) {
    const rows = await this.prisma.line.findMany({
      where: {
        ...(currentId ? { id: { not: currentId } } : {}),
        OR: [{ entryNodeId: nodeId, entryPort: port }, { exitNodeId: nodeId, exitPort: port }]
      },
      select: { protocolType: true }
    });
    const wantsUdp = UDP_PROTOCOLS.has(protocolType);
    if (rows.some((line) => UDP_PROTOCOLS.has(line.protocolType as ProtocolType) === wantsUdp)) {
      throw new ConflictException(`节点 ${nodeId} 的端口 ${port} 已被同传输层线路占用`);
    }
  }

  private async findAvailablePort(nodeId: string, protocolType: ProtocolType, currentId?: string) {
    try {
      return await findAvailableRandomPort(async (port) => {
        const rows = await this.prisma.line.findMany({
          where: {
            ...(currentId ? { id: { not: currentId } } : {}),
            OR: [{ entryNodeId: nodeId, entryPort: port }, { exitNodeId: nodeId, exitPort: port }]
          },
          select: { protocolType: true }
        });
        const wantsUdp = UDP_PROTOCOLS.has(protocolType);
        return !rows.some((line) => UDP_PROTOCOLS.has(line.protocolType as ProtocolType) === wantsUdp);
      });
    } catch {
      throw new ConflictException('没有可用的随机线路端口');
    }
  }

  private async assertLineTagsAvailable(input: {
    id?: string;
    tag: string | null;
    type: LineType;
    entryNodeId: string;
    exitNodeId: string;
  }) {
    if (!input.tag) return;
    const existing = await this.prisma.line.findMany({
      where: input.id ? { id: { not: input.id } } : undefined,
      select: { id: true, tag: true, type: true, entryNodeId: true, exitNodeId: true }
    });
    const candidate = resolveLineTags({ id: input.id ?? 'pending', tag: input.tag, type: input.type });
    const candidateTags = new Map<string, string>();
    if (candidate.direct) candidateTags.set(input.entryNodeId, candidate.direct);
    if (candidate.entry) candidateTags.set(input.entryNodeId, candidate.entry);
    if (candidate.exit) candidateTags.set(input.exitNodeId, candidate.exit);

    for (const line of existing) {
      const tags = resolveLineTags(line);
      const existingTags = new Map<string, string>();
      if (tags.direct) existingTags.set(line.entryNodeId, tags.direct);
      if (tags.entry) existingTags.set(line.entryNodeId, tags.entry);
      if (tags.exit) existingTags.set(line.exitNodeId, tags.exit);
      for (const [nodeId, tag] of candidateTags) {
        if (existingTags.get(nodeId) === tag) {
          throw new ConflictException(`节点 ${nodeId} 的线路 Tag「${tag}」已被占用`);
        }
      }
    }
  }

  private parseObject(value: string): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }

  private parseObjectValue(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  private parseTags(value: string) {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }

  private deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
    const output = { ...target };
    for (const key of Object.keys(source)) {
      const sourceValue = source[key];
      const targetValue = target[key];
      if (
        sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue) &&
        targetValue && typeof targetValue === 'object' && !Array.isArray(targetValue)
      ) {
        output[key] = this.deepMerge(targetValue as Record<string, unknown>, sourceValue as Record<string, unknown>);
      } else if (sourceValue !== undefined) {
        output[key] = sourceValue;
      }
    }
    return output;
  }

  private toView(line: LineWithRelations) {
    const serverHost = line.endpointOverrideEnabled && line.serverHost ? line.serverHost : line.entryNode.serverHost;
    const serverPort = line.endpointOverrideEnabled && line.serverPort ? line.serverPort : line.entryPort;
    const params = sanitizeInboundParams(this.parseObject(line.paramsJson));
    return {
      ...line,
      protocolType: line.protocolType as ProtocolType,
      params,
      serverHost,
      serverPort,
      serverName: line.endpointOverrideEnabled ? line.serverName : null,
      host: line.endpointOverrideEnabled ? line.host : null,
      endpointOverrides: {
        serverHost: line.serverHost,
        serverPort: line.serverPort,
        serverName: line.serverName,
        host: line.host
      },
      tags: this.parseTags(line.tagsJson),
      topology: {
        entry: { node: line.entryNode, port: line.entryPort },
        exit: { node: line.exitNode, port: line.exitPort }
      },
      // 兼容旧版消费方的只读目标摘要；新代码应使用 protocolType/params/exitNode。
      targetInbound: {
        id: line.id,
        nodeId: line.exitNodeId,
        type: line.protocolType,
        tag: resolveLineTags(line).exit ?? resolveLineTags(line).direct ?? `line-${line.id}`,
        listen: line.listen,
        port: line.exitPort,
        params,
        node: line.exitNode
      },
      certificate: line.certificate ? {
        id: line.certificate.id,
        name: line.certificate.name,
        subject: line.certificate.subject,
        issuer: line.certificate.issuer,
        sans: this.parseTags(line.certificate.sansJson),
        validFrom: line.certificate.validFrom,
        validTo: line.certificate.validTo
      } : null,
      tagsJson: undefined,
      paramsJson: undefined
    };
  }
}
