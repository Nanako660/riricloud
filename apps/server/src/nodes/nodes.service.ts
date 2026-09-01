import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AgentService } from '../agent-gateway/agent.service';
import { BinariesService, normalizeOsArch } from '../binaries/binaries.service';
import { generateRealityKeypair } from '../common/inbound';
import { generateAgentToken } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';
import { ProbeNodeDto } from './dto/probe-node.dto';
import { CreateNodeDto } from './dto/create-node.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import { UpgradeNodeDto } from './dto/upgrade-node.dto';
import { SettingsService } from '../system/settings.service';
import { Optional } from '@nestjs/common';

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
    private readonly agentGateway: AgentService,
    private readonly binaries: BinariesService,
    @Optional() private readonly settingsService?: SettingsService
  ) {}

  async list() {
    const nodes = await this.prisma.node.findMany({ include: nodeLinesInclude, orderBy: [{ createdAt: 'asc' }] });
    return nodes.map((node) => this.sanitize(node));
  }

  async detail(id: string) {
    const node = await this.prisma.node.findUnique({ where: { id }, include: nodeLinesInclude });
    if (!node) throw new NotFoundException('节点不存在');
    return {
      node: {
        ...this.sanitize(node),
        installCommands: {
          ws: this.buildInstallCommand(node.agentToken, 'WS', node.osArch),
          http: this.buildInstallCommand(node.agentToken, 'HTTP', node.osArch)
        },
        uninstallCommand: this.buildUninstallCommand()
      }
    };
  }

  async create(dto: CreateNodeDto, _operatorId: string) {
    const communicationMode = dto.communicationMode ?? 'WS';
    const settings = await this.settingsService?.getSettings();
    const node = await this.prisma.node.create({
      data: {
        name: dto.name?.trim() || `节点 ${dto.serverHost}`,
        serverHost: dto.serverHost.trim(),
        agentToken: generateAgentToken(),
        communicationMode,
        pollIntervalSecs: settings?.defaultPollIntervalSecs ?? 15
      },
      include: nodeLinesInclude
    });
    return {
      node: this.sanitize(node),
      agentToken: node.agentToken,
      installCommand: this.buildInstallCommand(node.agentToken, communicationMode),
      installCommands: {
        ws: this.buildInstallCommand(node.agentToken, 'WS'),
        http: this.buildInstallCommand(node.agentToken, 'HTTP')
      },
      uninstallCommand: this.buildUninstallCommand()
    };
  }

  async requestReload(id: string) {
    await this.requireNode(id);
    const pushed = await this.agentGateway.pushConfig(id);
    return { requested: pushed, nodeId: id };
  }

  async requestUpgrade(id: string, dto: UpgradeNodeDto) {
    const node = await this.requireNode(id);
    try {
      const hasCustomUrl = dto.url !== undefined;
      const hasCustomSha = dto.sha256 !== undefined;
      if (hasCustomUrl !== hasCustomSha) throw new Error('自定义升级地址与 SHA-256 必须同时提供');
      let version = dto.version?.trim() ?? '';
      let url = dto.url?.trim() ?? '';
      let sha256 = dto.sha256?.trim().toLowerCase() ?? '';
      if (!hasCustomUrl) {
        const asset = await this.binaries.resolveForNode(dto.target, node.osArch, node.agentToken);
        version = version || asset.version;
        url = asset.url;
        sha256 = asset.sha256;
      }
      if (!version) throw new Error('升级版本不能为空');
      return await this.agentGateway.requestUpgrade(id, dto.target, version, url, sha256);
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

  async requestRestart(id: string) {
    await this.requireNode(id);
    return this.agentGateway.requestRestart(id);
  }

  async taskStatus(nodeId: string, taskId: string) {
    await this.requireNode(nodeId);
    return this.agentGateway.getTaskStatus(nodeId, taskId);
  }

  async update(id: string, dto: UpdateNodeDto) {
    await this.requireNode(id);
    const data: { name?: string; serverHost?: string; configOverride?: string | null; communicationMode?: 'WS' | 'HTTP'; pollIntervalSecs?: number } = {};
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
    if (dto.communicationMode !== undefined) data.communicationMode = dto.communicationMode;
    if (dto.pollIntervalSecs !== undefined) data.pollIntervalSecs = dto.pollIntervalSecs;
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

  private buildInstallCommand(token: string, mode: 'WS' | 'HTTP', osArch?: string | null) {
    const platform = normalizeOsArch(osArch) ?? 'linux-amd64';
    const master = mode === 'HTTP' ? 'https://<master-domain>' : 'wss://<master-domain>/ws/agent';
    const temp = `/tmp/riri-agent-${token.slice(0, 12)}`;
    return `curl -fsSL --location -A 'riri-agent-installer/${platform}' 'https://<master-domain>/api/v1/downloads/agent?token=${token}' -o ${temp} && install -m 0755 ${temp} /usr/local/bin/riri-agent && rm -f ${temp} && /usr/local/bin/riri-agent install --token=${token} --master=${master}`;
  }

  private buildUninstallCommand() {
    return 'sudo /usr/local/bin/riri-agent uninstall --purge --yes';
  }

  private sanitize(node: NodeWithLines): Record<string, unknown> {
    const { entryLines, exitLines, lastProbeResult, ...rest } = node;
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
    return { ...rest, lastProbeResult: this.parseJson(lastProbeResult), lines, entryLines: entry, exitLines: exit, servicePorts };
  }

  private parseTags(value: string) {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }

  private parseJson(value: string | null): unknown {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
}
