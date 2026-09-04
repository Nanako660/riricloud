import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AgentService, type UpgradeTaskOptions } from '../agent-gateway/agent.service';
import { BinariesService, normalizeOsArch } from '../binaries/binaries.service';
import { BinaryResourcesService } from '../binaries/binary-resources.service';
import { generateRealityKeypair } from '../common/inbound';
import { generateAgentToken } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';
import { ProbeNodeDto } from './dto/probe-node.dto';
import { CreateNodeDto } from './dto/create-node.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import { UpgradeNodeDto } from './dto/upgrade-node.dto';
import { SettingsService } from '../system/settings.service';
import { appendPublicPath, resolvePublicBaseUrl, toWebSocketBaseUrl } from '../common/public-url';

const nodeSummary = { select: { id: true, name: true, serverHost: true, status: true, isLocal: true } } as const;
const nodeLinesInclude = {
  entryLines: { include: { landingNode: nodeSummary, targetLine: { include: { entryNode: nodeSummary } } }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
  landingLines: { include: { entryNode: nodeSummary }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }
} satisfies Prisma.NodeInclude;
type NodeWithLines = Prisma.NodeGetPayload<{ include: typeof nodeLinesInclude }>;

@Injectable()
export class NodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentGateway: AgentService,
    @Optional() private readonly binaries?: BinariesService,
    @Optional() private readonly resources?: BinaryResourcesService,
    @Optional() private readonly settingsService?: SettingsService
  ) {}

  async list() {
    const nodes = await this.prisma.node.findMany({ include: nodeLinesInclude, orderBy: [{ createdAt: 'asc' }] });
    return nodes.map((node) => this.sanitize(node));
  }

  async detail(id: string, requestBaseUrl?: string) {
    const node = await this.prisma.node.findUnique({ where: { id }, include: nodeLinesInclude });
    if (!node) throw new NotFoundException('节点不存在');
    const settings = await this.settingsService?.getSettings();
    const publicBaseUrl = resolvePublicBaseUrl({
      configuredBaseUrl: settings?.publicBaseUrl,
      requestBaseUrl
    });
    return {
      node: {
        ...this.sanitize(node),
        installCommands: {
          ws: this.buildInstallCommand(node.agentToken, 'WS', node.osArch, publicBaseUrl),
          http: this.buildInstallCommand(node.agentToken, 'HTTP', node.osArch, publicBaseUrl)
        },
        uninstallCommand: this.buildUninstallCommand()
      }
    };
  }

  async create(dto: CreateNodeDto, _operatorId: string, requestBaseUrl?: string) {
    const communicationMode = dto.communicationMode ?? 'WS';
    const settings = await this.settingsService?.getSettings();
    const publicBaseUrl = resolvePublicBaseUrl({
      configuredBaseUrl: settings?.publicBaseUrl,
      requestBaseUrl
    });
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
      installCommand: this.buildInstallCommand(node.agentToken, communicationMode, node.osArch, publicBaseUrl),
      installCommands: {
        ws: this.buildInstallCommand(node.agentToken, 'WS', node.osArch, publicBaseUrl),
        http: this.buildInstallCommand(node.agentToken, 'HTTP', node.osArch, publicBaseUrl)
      },
      uninstallCommand: this.buildUninstallCommand()
    };
  }

  async requestReload(id: string) {
    await this.requireNode(id);
    const pushed = await this.agentGateway.pushConfig(id);
    return { requested: pushed, nodeId: id };
  }

  async requestUpgrade(id: string, dto: UpgradeNodeDto, requestBaseUrl?: string, operatorId?: string, operation: 'UPGRADE' | 'ROLLBACK' = 'UPGRADE') {
    const node = await this.requireNode(id);
    try {
      const hasCustomUrl = dto.url !== undefined;
      const hasCustomSha = dto.sha256 !== undefined;
      if (hasCustomUrl !== hasCustomSha) throw new Error('自定义升级地址与 SHA-256 必须同时提供');
      if (dto.resourceId && hasCustomUrl) throw new Error('资源版本与自定义升级地址不能同时提供');
      let version = dto.version?.trim() ?? '';
      let url = dto.url?.trim() ?? '';
      let sha256 = dto.sha256?.trim().toLowerCase() ?? '';
      let managed: Awaited<ReturnType<BinaryResourcesService['resolveForNode']>> | undefined;
      if (!hasCustomUrl) {
        if (this.resources) {
          managed = await this.resources.resolveForNode(dto.target, node.osArch, node.agentToken, requestBaseUrl, dto.resourceId, node);
        } else if (this.binaries) {
          managed = await this.binaries.resolveForNode(dto.target, node.osArch, node.agentToken, requestBaseUrl) as Awaited<ReturnType<BinaryResourcesService['resolveForNode']>>;
        } else {
          throw new Error('二进制资源服务不可用');
        }
        version = version || managed.version;
        url = managed.url;
        sha256 = managed.sha256;
      }
      if (!version) throw new Error('升级版本不能为空');
      const options: UpgradeTaskOptions = {
        resourceId: managed?.resourceId,
        assetId: managed?.assetId,
        releaseId: managed?.resourceId,
        previousAssetId: dto.target === 'agent' ? node.currentAgentAssetId : node.currentSingboxAssetId,
        operation,
        files: managed && 'files' in managed
          ? managed.files.map((file) => ({ ...file, role: file.role === 'auxiliary' ? 'auxiliary' as const : 'main' as const }))
          : undefined,
        requestedById: operatorId
      };
      if (!options.resourceId && !options.assetId && !options.files?.length) {
        return await this.agentGateway.requestUpgrade(id, dto.target, version, url, sha256);
      }
      return await this.agentGateway.requestUpgrade(id, dto.target, version, url, sha256, options);
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
    return this.agentGateway.getPersistedTaskStatus(nodeId, taskId);
  }

  async retryUpgrade(nodeId: string, taskId: string, operatorId?: string) {
    await this.requireNode(nodeId);
    return this.agentGateway.retryUpgrade(nodeId, taskId, operatorId);
  }

  async rollbackUpgrade(nodeId: string, taskId: string, requestBaseUrl?: string, operatorId?: string) {
    await this.requireNode(nodeId);
    const task = await this.prisma.binaryDeploymentTask.findFirst({
      where: { id: taskId, nodeId },
      include: { previousAsset: true }
    });
    if (!task?.previousAsset) throw new BadRequestException('该升级任务没有可回滚的上一版本');
    return this.requestUpgrade(
      nodeId,
      { target: task.kind.toLowerCase() as 'agent' | 'singbox', resourceId: task.previousAsset.releaseId },
      requestBaseUrl,
      operatorId,
      'ROLLBACK'
    );
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
    void (dto.serverHost !== undefined ? this.agentGateway.pushConfigToAll() : this.agentGateway.pushConfig(id));
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

  private buildInstallCommand(token: string, mode: 'WS' | 'HTTP', osArch?: string | null, publicBaseUrl?: string) {
    const platform = normalizeOsArch(osArch) ?? 'linux-amd64';
    const baseUrl = publicBaseUrl ?? resolvePublicBaseUrl();
    const master = mode === 'HTTP'
      ? baseUrl
      : appendPublicPath(toWebSocketBaseUrl(baseUrl), 'ws/agent');
    const downloadUrl = appendPublicPath(baseUrl, `api/v1/downloads/agent?token=${encodeURIComponent(token)}`);
    const temp = `/tmp/riri-agent-${token.slice(0, 12)}`;
    return `curl -fsSL --location -A 'riri-agent-installer/${platform}' '${downloadUrl}' -o ${temp} && install -m 0755 ${temp} /usr/local/bin/riri-agent && rm -f ${temp} && /usr/local/bin/riri-agent install --token=${token} --master=${master}`;
  }

  private buildUninstallCommand() {
    return 'sudo /usr/local/bin/riri-agent uninstall --purge --yes';
  }

  private sanitize(node: NodeWithLines): Record<string, unknown> {
    const { entryLines, landingLines, lastProbeResult, ...rest } = node;
    const toLine = (line: (typeof entryLines)[number] | (typeof landingLines)[number], role: 'DIRECT' | 'TRANSIT' | 'LANDING') => ({
      id: line.id,
      name: line.name,
      type: line.type,
      relayMode: line.relayMode,
      protocolType: line.protocolType,
      entryNodeId: line.entryNodeId,
      entryPort: line.entryPort,
      landingNodeId: line.landingNodeId,
      landingPort: line.landingPort,
      targetLineId: line.targetLineId,
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
      landingNode: 'landingNode' in line ? line.landingNode : undefined,
      targetLine: 'targetLine' in line ? line.targetLine : undefined
    });

    const linesMap = new Map<string, ReturnType<typeof toLine>>();
    const servicePorts: Array<{ lineId: string; lineName: string; protocolType: string; role: 'DIRECT' | 'TRANSIT' | 'LANDING'; port: number }> = [];

    for (const line of entryLines) {
      if (line.type === 'DIRECT') {
        const item = toLine(line, 'DIRECT');
        linesMap.set(line.id, item);
        servicePorts.push({ lineId: line.id, lineName: line.name, protocolType: line.protocolType, role: 'DIRECT', port: line.entryPort });
      } else {
        const item = toLine(line, 'TRANSIT');
        linesMap.set(line.id, item);
        servicePorts.push({ lineId: line.id, lineName: line.name, protocolType: line.protocolType, role: 'TRANSIT', port: line.entryPort });
      }
    }

    for (const line of landingLines) {
      if (!linesMap.has(line.id)) {
        const item = toLine(line, 'LANDING');
        linesMap.set(line.id, item);
      }
      if (line.type === 'RELAY' && line.relayMode !== 'TARGET_LINE' && line.landingPort) {
        servicePorts.push({ lineId: line.id, lineName: line.name, protocolType: line.protocolType, role: 'LANDING', port: line.landingPort });
      }
    }

    const lines = [...linesMap.values()];
    return { ...rest, lastProbeResult: this.parseJson(lastProbeResult), lines, entryLines, landingLines, servicePorts };
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
