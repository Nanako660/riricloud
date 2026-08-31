import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AgentGatewayService } from '../agent-gateway/agent-gateway.service';
import { generateRealityKeypair } from '../common/inbound';
import { generateAgentToken } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';
import { ProbeNodeDto } from './dto/probe-node.dto';
import { CreateNodeDto } from './dto/create-node.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import { UpgradeNodeDto } from './dto/upgrade-node.dto';

const nodeSummary = { select: { id: true, name: true, serverHost: true, status: true, isLocal: true } } as const;
const nodeLinesInclude = {
  entryLines: { include: { exitNode: nodeSummary }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
  exitLines: { include: { entryNode: nodeSummary }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }
} satisfies Prisma.NodeInclude;
type NodeWithLines = Prisma.NodeGetPayload<{ include: typeof nodeLinesInclude }>;

@Injectable()
export class NodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentGateway: AgentGatewayService
  ) {}

  async list() {
    const nodes = await this.prisma.node.findMany({ include: nodeLinesInclude, orderBy: [{ createdAt: 'asc' }] });
    return nodes.map((node) => this.sanitize(node));
  }

  async detail(id: string) {
    const node = await this.prisma.node.findUnique({ where: { id }, include: nodeLinesInclude });
    if (!node) throw new NotFoundException('节点不存在');
    return { node: this.sanitize(node) };
  }

  async create(dto: CreateNodeDto, _operatorId: string) {
    const node = await this.prisma.node.create({
      data: {
        name: dto.name?.trim() || `节点 ${dto.serverHost}`,
        serverHost: dto.serverHost.trim(),
        agentToken: generateAgentToken()
      },
      include: nodeLinesInclude
    });
    return {
      node: this.sanitize(node),
      agentToken: node.agentToken,
      installCommand: this.buildInstallCommand(node.agentToken)
    };
  }

  async requestReload(id: string) {
    await this.requireNode(id);
    const pushed = await this.agentGateway.pushConfig(id);
    return { requested: pushed, nodeId: id };
  }

  async requestUpgrade(id: string, dto: UpgradeNodeDto) {
    await this.requireNode(id);
    try {
      return await this.agentGateway.requestUpgrade(id, dto.target, dto.version.trim(), dto.url, dto.sha256.toLowerCase());
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : '升级任务参数无效');
    }
  }

  async requestProbe(id: string, dto: ProbeNodeDto) {
    await this.requireNode(id);
    try {
      return await this.agentGateway.requestProbe(id, dto.probes);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : '探针任务参数无效');
    }
  }

  async update(id: string, dto: UpdateNodeDto) {
    await this.requireNode(id);
    const data: { name?: string; serverHost?: string; configOverride?: string | null } = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('节点名称不能为空');
      data.name = name;
    }
    if (dto.serverHost !== undefined) {
      const serverHost = dto.serverHost.trim();
      if (!serverHost) throw new BadRequestException('服务器地址不能为空');
      data.serverHost = serverHost;
    }
    if (dto.configOverride !== undefined) {
      data.configOverride = dto.configOverride === null || dto.configOverride.trim() === ''
        ? null
        : this.validateConfigOverride(dto.configOverride);
    }
    if (Object.keys(data).length === 0) throw new BadRequestException('未提供任何更新字段');
    const updated = await this.prisma.node.update({ where: { id }, data, include: nodeLinesInclude });
    void this.agentGateway.pushConfig(id);
    return { node: this.sanitize(updated) };
  }

  async remove(id: string) {
    const node = await this.requireNode(id);
    if (node.isLocal) throw new ConflictException('主控本机节点不可删除');
    this.agentGateway.disconnectNode(id);
    await this.prisma.node.delete({ where: { id } });
    return { deleted: true, id };
  }

  realityKeypair() {
    return generateRealityKeypair();
  }

  private async requireNode(id: string) {
    const node = await this.prisma.node.findUnique({ where: { id } });
    if (!node) throw new NotFoundException('节点不存在');
    return node;
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

  private sanitize(node: NodeWithLines): Record<string, unknown> {
    const { entryLines, exitLines, ...rest } = node;
    const toLine = (line: (typeof entryLines)[number], role: 'ENTRY' | 'EXIT') => ({
      id: line.id,
      name: line.name,
      type: line.type,
      relayMode: line.relayMode,
      protocolType: line.protocolType,
      entryNodeId: line.entryNodeId,
      entryPort: line.entryPort,
      exitNodeId: line.exitNodeId,
      exitPort: line.exitPort,
      serverHost: line.serverHost,
      serverPort: line.serverPort,
      trafficRate: line.trafficRate,
      tags: this.parseTags(line.tagsJson),
      level: line.level,
      sortOrder: line.sortOrder,
      isPublic: line.isPublic,
      status: line.status,
      role,
      entryNode: 'entryNode' in line ? line.entryNode : undefined,
      exitNode: 'exitNode' in line ? line.exitNode : undefined
    });
    const entry = entryLines.map((line) => toLine(line, 'ENTRY'));
    const exit = exitLines.map((line) => toLine(line as unknown as (typeof entryLines)[number], 'EXIT'));
    const all = new Map<string, Record<string, unknown>>();
    for (const line of [...entry, ...exit]) {
      const existing = all.get(line.id);
      all.set(line.id, existing ? { ...existing, role: 'ENTRY_AND_EXIT' } : line);
    }
    const lines = [...all.values()];
    const servicePorts = lines.flatMap((line) => {
      const ports: Array<Record<string, unknown>> = [];
      if (line.entryNodeId === node.id) ports.push({ lineId: line.id, lineName: line.name, protocolType: line.protocolType, role: 'ENTRY', port: line.entryPort });
      if (line.exitNodeId === node.id) ports.push({ lineId: line.id, lineName: line.name, protocolType: line.protocolType, role: 'EXIT', port: line.exitPort });
      return ports;
    });
    return { ...rest, lines, entryLines: entry, exitLines: exit, servicePorts };
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
