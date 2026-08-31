import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AgentGatewayService } from '../agent-gateway/agent-gateway.service';
import { sanitizeInboundParams } from '../common/inbound';
import {
  LINE_TYPES,
  PROTOCOL_PROXY_TARGET_TYPES,
  RELAY_MODES,
  LineStatus,
  LineType,
  RelayMode
} from '../common/constants';
import { findAvailableRandomPort } from '../common/ports';
import { PrismaService } from '../prisma/prisma.service';
import { BatchLineStatusDto } from './dto/batch-line-status.dto';
import { CreateLineDto } from './dto/create-line.dto';
import { QueryLineDto } from './dto/query-line.dto';
import { ReorderLinesDto } from './dto/reorder-lines.dto';
import { UpdateLineDto } from './dto/update-line.dto';

const lineInclude = {
  entryNode: { select: { id: true, name: true, serverHost: true, status: true, isLocal: true } },
  targetInbound: {
    include: {
      node: { select: { id: true, name: true, serverHost: true, status: true, isLocal: true } }
    }
  }
} as const;

type LineWithRelations = Prisma.LineGetPayload<{ include: typeof lineInclude }>;

type LineInput = {
  name?: string;
  type?: LineType;
  relayMode?: RelayMode | null;
  entryNodeId?: string | null;
  entryPort?: number | null;
  targetInboundId?: string;
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

@Injectable()
export class LinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentGateway: AgentGatewayService
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
    const line = await this.findRaw(id);
    return { line: this.toView(line) };
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
      relayMode: current.relayMode as RelayMode | null,
      entryNodeId: current.entryNodeId,
      entryPort: current.type === 'RELAY' ? undefined : current.entryPort,
      targetInboundId: current.targetInboundId,
      endpointOverrideEnabled: current.endpointOverrideEnabled,
      serverHost: current.serverHost,
      serverPort: current.serverPort,
      serverName: current.serverName,
      host: current.host,
      trafficRate: current.trafficRate,
      tags: this.parseTags(current.tagsJson),
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
      endpoint: { serverHost: view.serverHost, serverPort: view.serverPort ?? line.targetInbound.port, serverName: view.serverName, host: view.host },
      target: {
        nodeId: line.targetInbound.node.id,
        nodeName: line.targetInbound.node.name,
        inboundId: line.targetInbound.id,
        type: line.targetInbound.type,
        tag: line.targetInbound.tag,
        port: line.targetInbound.port
      },
      relay: line.type === 'RELAY'
        ? { mode: line.relayMode, entryNodeId: line.entryNodeId, entryPort: line.entryPort }
        : null
    };
  }

  async getAvailableForPlan(plan: { lineMatchMode: string; lineTagsJson: string; lineIdsJson: string }) {
    const rows = await this.prisma.line.findMany({
      where: { isPublic: true, status: 'ACTIVE' },
      include: lineInclude,
      orderBy: [{ sortOrder: 'asc' }, { level: 'desc' }, { createdAt: 'asc' }]
    });
    const tags = this.parseTags(plan.lineTagsJson);
    const ids = this.parseTags(plan.lineIdsJson);
    return rows
      .filter((line) => line.targetInbound.node.status === 'ONLINE' && (!line.entryNode || line.entryNode.status === 'ONLINE'))
      .filter((line) => {
        if (plan.lineMatchMode === 'EXPLICIT') return ids.includes(line.id);
        if (plan.lineMatchMode === 'TAGS') return tags.some((tag) => this.parseTags(line.tagsJson).includes(tag));
        return true;
      })
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
    const targetInboundId = input.targetInboundId ?? current?.targetInboundId;
    if (!targetInboundId) throw new BadRequestException('必须指定目标入站');
    const targetInbound = await this.prisma.nodeInbound.findUnique({ where: { id: targetInboundId }, include: { node: true } });
    if (!targetInbound) throw new NotFoundException('目标入站不存在');

    const requestedEntryNodeId = input.entryNodeId !== undefined ? input.entryNodeId : current?.entryNodeId;
    const entryNodeId = type === 'DIRECT' ? targetInbound.nodeId : requestedEntryNodeId;
    if (type === 'RELAY' && !entryNodeId) throw new BadRequestException('中继线路必须指定入口节点');
    if (type === 'DIRECT' && requestedEntryNodeId && requestedEntryNodeId !== targetInbound.nodeId) {
      throw new BadRequestException('直连线路的入口节点必须与目标入站所属节点一致');
    }
    if (entryNodeId && !(await this.prisma.node.findUnique({ where: { id: entryNodeId } }))) {
      throw new NotFoundException('入口节点不存在');
    }

    const entryPort = type === 'RELAY'
      ? input.entryPort !== undefined
        ? input.entryPort
        : current?.entryPort ?? await this.findAvailableEntryPort(entryNodeId!, current?.id)
      : null;
    if (type === 'RELAY' && !entryPort) throw new BadRequestException('中继线路必须指定入口端口');
    if (entryNodeId && entryPort) await this.assertEntryPortAvailable(entryNodeId, entryPort, current?.id);

    const relayMode = type === 'RELAY'
      ? input.relayMode !== undefined ? input.relayMode : current?.relayMode
      : null;
    if (type === 'RELAY' && (!relayMode || !RELAY_MODES.includes(relayMode as RelayMode))) {
      throw new BadRequestException('中继线路必须指定有效的中继机制');
    }
    if (
      relayMode === 'PROTOCOL_PROXY' &&
      !PROTOCOL_PROXY_TARGET_TYPES.includes(targetInbound.type as (typeof PROTOCOL_PROXY_TARGET_TYPES)[number])
    ) {
      throw new BadRequestException(`协议代理不支持目标入站协议：${targetInbound.type}`);
    }

    const name = input.name !== undefined ? input.name.trim() : current?.name;
    if (!name) throw new BadRequestException('线路名称不能为空');
    const optionalText = (value: string | null | undefined, fallback: string | null | undefined) => {
      if (value === undefined) return fallback ?? null;
      if (value === null) return null;
      const trimmed = value.trim();
      return trimmed || null;
    };
    const tags = input.tags !== undefined ? input.tags.map((tag) => tag.trim()).filter(Boolean) : current ? this.parseTags(current.tagsJson) : [];

    return {
      name,
      type,
      relayMode,
      entryNodeId,
      entryPort,
      targetInboundId,
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

  private async assertEntryPortAvailable(entryNodeId: string, entryPort: number, currentId?: string) {
    const [inbound, relay] = await Promise.all([
      this.prisma.nodeInbound.findFirst({ where: { nodeId: entryNodeId, port: entryPort } }),
      this.prisma.line.findFirst({ where: { entryNodeId, entryPort, ...(currentId ? { id: { not: currentId } } : {}) } })
    ]);
    if (inbound || relay) throw new ConflictException(`入口端口 ${entryPort} 已被占用`);
  }

  private async findAvailableEntryPort(entryNodeId: string, currentId?: string) {
    try {
      return await findAvailableRandomPort(async (port) => {
        const [inbound, line] = await Promise.all([
          this.prisma.nodeInbound.findFirst({ where: { nodeId: entryNodeId, port } }),
          this.prisma.line.findFirst({ where: { entryNodeId, entryPort: port, ...(currentId ? { id: { not: currentId } } : {}) } })
        ]);
        return !inbound && !line;
      });
    } catch {
      throw new ConflictException('没有可用的随机中继入口端口');
    }
  }

  private parseTags(value: string) {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }

  private toView(line: LineWithRelations) {
    const targetNode = line.targetInbound.node;
    const entryNode = line.entryNode ?? targetNode;
    const serverHost = line.endpointOverrideEnabled && line.serverHost
      ? line.serverHost
      : line.type === 'RELAY' ? entryNode.serverHost : targetNode.serverHost;
    const serverPort = line.endpointOverrideEnabled && line.serverPort
      ? line.serverPort
      : (line.type === 'RELAY' ? line.entryPort : line.targetInbound.port) ?? line.targetInbound.port;
    return {
      ...line,
      endpointOverrideEnabled: line.endpointOverrideEnabled,
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
      targetInbound: {
        id: line.targetInbound.id,
        nodeId: line.targetInbound.nodeId,
        type: line.targetInbound.type,
        tag: line.targetInbound.tag,
        listen: line.targetInbound.listen,
        port: line.targetInbound.port,
        params: sanitizeInboundParams(JSON.parse(line.targetInbound.paramsJson) as Record<string, unknown>),
        node: line.targetInbound.node
      },
      entryNode,
      tagsJson: undefined
    };
  }
}
