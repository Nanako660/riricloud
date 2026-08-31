import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { AgentGatewayService } from '../agent-gateway/agent-gateway.service';
import { PrismaService } from '../prisma/prisma.service';
import { generateAgentToken } from '../common/utils';
import { ProtocolType } from '../common/constants';
import {
  generateRealityKeypair,
  INBOUND_DEFAULT_TAGS,
  normalizeInboundParams,
  sanitizeInboundParams,
  UDP_INBOUND_TYPES
} from '../common/inbound';
import { DEFAULT_INBOUND_LISTEN, findAvailableRandomPort } from '../common/ports';
import { CreateNodeDto } from './dto/create-node.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import { CreateInboundDto, UpdateInboundDto } from './dto/inbound.dto';
import { ProbeNodeDto } from './dto/probe-node.dto';
import { UpgradeNodeDto } from './dto/upgrade-node.dto';
import { LinesService } from '../lines/lines.service';

type NodeWithInbounds = {
  id: string;
  inbounds: Array<{
    id: string;
    nodeId: string;
    type: string;
    tag: string;
    listen: string;
    port: number;
    paramsJson: string;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
  entryLines: Array<{
    id: string;
    name: string;
    type: string;
    relayMode: string | null;
    entryNodeId: string | null;
    entryPort: number | null;
    targetInboundId: string;
    serverHost: string | null;
    serverPort: number | null;
    serverName: string | null;
    host: string | null;
    trafficRate: number;
    tagsJson: string;
    level: number;
    sortOrder: number;
    isPublic: boolean;
    status: string;
    targetInbound: { id: string; type: string; tag: string; port: number };
  }>;
} & Record<string, unknown>;

@Injectable()
export class NodesService {
  constructor(
    private prisma: PrismaService,
    private agentGateway: AgentGatewayService,
    @Optional() private linesService?: LinesService
  ) {}

  private readonly inboundOrder = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];

  // 管理端列表（含 agentToken、遥测与入站摘要）
  async list() {
    const nodes = await this.prisma.node.findMany({
      include: {
        inbounds: { orderBy: this.inboundOrder },
        entryLines: { include: { targetInbound: { select: { id: true, type: true, tag: true, port: true } } }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }
      },
      orderBy: [{ createdAt: 'asc' }]
    });
    return nodes.map((node) => this.sanitize(node));
  }

  async detail(id: string) {
    const node = await this.prisma.node.findUnique({
      where: { id },
      include: {
        inbounds: { orderBy: this.inboundOrder },
        entryLines: { include: { targetInbound: { select: { id: true, type: true, tag: true, port: true } } }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }
      }
    });
    if (!node) {
      throw new NotFoundException('节点不存在');
    }
    return { node: this.sanitize(node) };
  }

  async create(dto: CreateNodeDto, _operatorId: string) {
    const node = await this.prisma.node.create({
      data: {
        name: dto.name?.trim() || `节点 ${dto.serverHost}`,
        serverHost: dto.serverHost.trim(),
        agentToken: generateAgentToken(),
      },
      include: { inbounds: true, entryLines: { include: { targetInbound: { select: { id: true, type: true, tag: true, port: true } } } } }
    });
    return {
      node: this.sanitize(node),
      agentToken: node.agentToken,
      installCommand: this.buildInstallCommand(node.agentToken)
    };
  }

  async requestReload(id: string) {
    const node = await this.prisma.node.findUnique({ where: { id } });
    if (!node) {
      throw new NotFoundException('节点不存在');
    }
    const pushed = await this.agentGateway.pushConfig(id);
    return { requested: pushed, nodeId: id };
  }

  async requestUpgrade(id: string, dto: UpgradeNodeDto) {
    const node = await this.prisma.node.findUnique({ where: { id } });
    if (!node) throw new NotFoundException('节点不存在');
    try {
      return await this.agentGateway.requestUpgrade(id, dto.target, dto.version.trim(), dto.url, dto.sha256.toLowerCase());
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : '升级任务参数无效');
    }
  }

  async requestProbe(id: string, dto: ProbeNodeDto) {
    const node = await this.prisma.node.findUnique({ where: { id } });
    if (!node) throw new NotFoundException('节点不存在');
    try {
      return await this.agentGateway.requestProbe(id, dto.probes);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : '探针任务参数无效');
    }
  }

  async update(id: string, dto: UpdateNodeDto) {
    const node = await this.prisma.node.findUnique({ where: { id } });
    if (!node) {
      throw new NotFoundException('节点不存在');
    }
    const data: {
      name?: string;
      serverHost?: string;
      configOverride?: string | null;
    } = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) {
        throw new BadRequestException('节点名称不能为空');
      }
      data.name = name;
    }
    if (dto.serverHost !== undefined) {
      const serverHost = dto.serverHost.trim();
      if (!serverHost) {
        throw new BadRequestException('服务器地址不能为空');
      }
      data.serverHost = serverHost;
    }
    if (dto.configOverride !== undefined) {
      if (dto.configOverride === null || dto.configOverride.trim() === '') {
        data.configOverride = null;
      } else {
        data.configOverride = this.validateConfigOverride(dto.configOverride);
      }
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('未提供任何更新字段');
    }
    const updated = await this.prisma.node.update({
      where: { id },
      data,
      include: {
        inbounds: { orderBy: this.inboundOrder },
        entryLines: { include: { targetInbound: { select: { id: true, type: true, tag: true, port: true } } }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }
      }
    });
    // 主机地址影响订阅输出、configOverride 影响下发配置：在线时热推送
    void this.agentGateway.pushConfig(id);
    return { node: this.sanitize(updated) };
  }

  async remove(id: string) {
    const node = await this.prisma.node.findUnique({ where: { id } });
    if (!node) {
      throw new NotFoundException('节点不存在');
    }
    if (node.isLocal) {
      throw new ConflictException('主控本机节点不可删除');
    }
    // 先断开在线 Agent 再删库；入站与 TrafficLog 由外键 onDelete: Cascade 一并删除
    this.agentGateway.disconnectNode(id);
    await this.prisma.node.delete({ where: { id } });
    return { deleted: true, id };
  }

  // 供前端「生成密钥对」按钮使用（不落库）
  realityKeypair() {
    return generateRealityKeypair();
  }

  async createInbound(nodeId: string, dto: CreateInboundDto) {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      include: { inbounds: true }
    });
    if (!node) {
      throw new NotFoundException('节点不存在');
    }
    const tag = this.resolveTag(node.inbounds, dto.type, dto.tag);
    const listen = dto.listen?.trim() || DEFAULT_INBOUND_LISTEN;
    const port = dto.port ?? await this.findAvailableInboundPort(nodeId, node.inbounds, dto.type);
    this.assertPortAvailable(node.inbounds, dto.type, port);
    await this.assertRelayEntryPortAvailable(nodeId, port);
    const params = normalizeInboundParams(dto.type, dto.params ?? {});
    const inbound = await this.prisma.nodeInbound.create({
      data: {
        nodeId,
        type: dto.type,
        tag,
        listen,
        port,
        paramsJson: JSON.stringify(params),
        sortOrder: dto.sortOrder ?? 0
      }
    });
    void this.agentGateway.pushConfig(nodeId);
    return { inbound: this.sanitizeInbound(inbound) };
  }

  async updateInbound(nodeId: string, inboundId: string, dto: UpdateInboundDto) {
    const inbound = await this.prisma.nodeInbound.findFirst({
      where: { id: inboundId, nodeId }
    });
    if (!inbound) {
      throw new NotFoundException('入站不存在');
    }
    const data: {
      tag?: string;
      listen?: string;
      port?: number;
      paramsJson?: string;
      sortOrder?: number;
    } = {};
    if (dto.tag !== undefined) {
      const tag = dto.tag.trim();
      if (!tag) {
        throw new BadRequestException('入站 tag 不能为空');
      }
      const conflict = await this.prisma.nodeInbound.findFirst({
        where: { nodeId, tag, id: { not: inboundId } }
      });
      if (conflict) {
        throw new ConflictException(`tag ${tag} 已被该节点其他入站使用`);
      }
      data.tag = tag;
    }
    if (dto.listen !== undefined) {
      const listen = dto.listen.trim();
      if (!listen) {
        throw new BadRequestException('监听地址不能为空');
      }
      data.listen = listen;
    }
    if (dto.port !== undefined) {
      const siblings = await this.prisma.nodeInbound.findMany({
        where: { nodeId, id: { not: inboundId } }
      });
      this.assertPortAvailable(siblings, inbound.type as ProtocolType, dto.port);
      await this.assertRelayEntryPortAvailable(nodeId, dto.port);
      data.port = dto.port;
    }
    if (dto.params !== undefined) {
      // 深度合并保留未提供键（私钥等脱敏字段不会随回传丢失），再按协议归一化
      const existingParams = JSON.parse(inbound.paramsJson) as Record<string, unknown>;
      const merged = this.deepMerge(existingParams, dto.params);
      data.paramsJson = JSON.stringify(normalizeInboundParams(inbound.type as ProtocolType, merged));
    }
    if (dto.sortOrder !== undefined) {
      data.sortOrder = dto.sortOrder;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('未提供任何更新字段');
    }
    const updated = await this.prisma.nodeInbound.update({ where: { id: inboundId }, data });
    void this.agentGateway.pushConfig(nodeId);
    return { inbound: this.sanitizeInbound(updated) };
  }

  async removeInbound(nodeId: string, inboundId: string) {
    const inbound = await this.prisma.nodeInbound.findFirst({
      where: { id: inboundId, nodeId }
    });
    if (!inbound) {
      throw new NotFoundException('入站不存在');
    }
    await this.prisma.nodeInbound.delete({ where: { id: inboundId } });
    void this.agentGateway.pushConfig(nodeId);
    return { deleted: true, id: inboundId };
  }

  async deriveLine(nodeId: string, inboundId: string) {
    if (!this.linesService) throw new BadRequestException('线路服务不可用');
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    const inbound = await this.prisma.nodeInbound.findFirst({ where: { id: inboundId, nodeId } });
    if (!node) throw new NotFoundException('节点不存在');
    if (!inbound) throw new NotFoundException('入站不存在');
    return this.linesService.create({
      name: `${node.name} · ${inbound.tag}`,
      type: 'DIRECT',
      targetInboundId: inbound.id,
      serverHost: node.serverHost,
      serverPort: inbound.port,
      status: 'ACTIVE',
      isPublic: true
    });
  }

  // tag 缺省按协议前缀生成；显式指定冲突时报错，缺省生成冲突时自动追加序号
  private resolveTag(
    existing: Array<{ tag: string }>,
    type: ProtocolType,
    explicit?: string
  ): string {
    if (explicit !== undefined) {
      const tag = explicit.trim();
      if (!tag) {
        throw new BadRequestException('入站 tag 不能为空');
      }
      if (existing.some((i) => i.tag === tag)) {
        throw new ConflictException(`tag ${tag} 已被该节点其他入站使用`);
      }
      return tag;
    }
    const base = INBOUND_DEFAULT_TAGS[type];
    if (!existing.some((i) => i.tag === base)) {
      return base;
    }
    for (let n = 2; ; n++) {
      const candidate = `${base}-${n}`;
      if (!existing.some((i) => i.tag === candidate)) {
        return candidate;
      }
    }
  }

  // 同节点同传输层（TCP/UDP）端口互斥；UDP 协议（QUIC）可与 TCP 协议同端口共存
  private assertPortAvailable(
    existing: Array<{ type: string; port: number }>,
    type: ProtocolType,
    port: number
  ) {
    const wantUdp = UDP_INBOUND_TYPES.includes(type);
    const conflict = existing.some(
      (i) => i.port === port && UDP_INBOUND_TYPES.includes(i.type as ProtocolType) === wantUdp
    );
    if (conflict) {
      throw new ConflictException(`端口 ${port} 已被该节点同传输层的其他入站占用`);
    }
  }

  private async findAvailableInboundPort(
    nodeId: string,
    existing: Array<{ type: string; port: number }>,
    type: ProtocolType
  ) {
    try {
      return await findAvailableRandomPort(async (port) => {
        const hasInboundConflict = existing.some(
          (inbound) => inbound.port === port && UDP_INBOUND_TYPES.includes(inbound.type as ProtocolType) === UDP_INBOUND_TYPES.includes(type)
        );
        if (hasInboundConflict) return false;
        const relay = await this.prisma.line.findFirst({ where: { entryNodeId: nodeId, entryPort: port } });
        return !relay;
      });
    } catch {
      throw new ConflictException('没有可用的随机入站端口');
    }
  }

  private async assertRelayEntryPortAvailable(nodeId: string, port: number) {
    const relay = await this.prisma.line.findFirst({ where: { entryNodeId: nodeId, entryPort: port } });
    if (relay) {
      throw new ConflictException(`端口 ${port} 已被中继线路入口占用`);
    }
  }

  private validateConfigOverride(raw: string): string {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadRequestException('configOverride 不是合法 JSON');
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new BadRequestException('configOverride 须为 JSON 对象');
    }
    return raw;
  }

  private buildInstallCommand(token: string) {
    return `curl -fsSL https://<master-domain>/api/v1/install.sh | bash -s -- --token=${token} --master=wss://<master-domain>/ws/agent`;
  }

  // 入站输出脱敏：paramsJson 解析为 params 并剥离私钥
  private sanitizeInbound(inbound: {
    paramsJson: string;
    [key: string]: unknown;
  }): Record<string, unknown> {
    const { paramsJson, ...rest } = inbound;
    const params = JSON.parse(paramsJson) as Record<string, unknown>;
    return { ...rest, params: sanitizeInboundParams(params) };
  }

  private deepMerge(
    target: Record<string, unknown>,
    source: Record<string, unknown>
  ): Record<string, unknown> {
    const output: Record<string, unknown> = { ...target };
    for (const key of Object.keys(source)) {
      const sVal = source[key];
      const tVal = target[key];
      if (
        sVal &&
        typeof sVal === 'object' &&
        !Array.isArray(sVal) &&
        tVal &&
        typeof tVal === 'object' &&
        !Array.isArray(tVal)
      ) {
        output[key] = this.deepMerge(
          tVal as Record<string, unknown>,
          sVal as Record<string, unknown>
        );
      } else if (sVal !== undefined) {
        output[key] = sVal;
      }
    }
    return output;
  }

  // 节点输出：入站脱敏；agentToken 保留（管理端安装指引需要，接口本身要求 ADMIN）
  private sanitize(node: NodeWithInbounds): Record<string, unknown> {
    const { entryLines = [], inbounds, ...rest } = node;
    return {
      ...rest,
      inbounds: inbounds.map((i) => this.sanitizeInbound(i)),
      entryLines: entryLines.map((line) => ({
        ...line,
        tags: this.parseTags(line.tagsJson),
        tagsJson: undefined,
        targetInbound: line.targetInbound
      }))
    };
  }

  private parseTags(value: string) {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }
}
