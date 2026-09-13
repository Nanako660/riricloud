import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AgentService, type UpgradeTaskOptions } from '../agent-gateway/agent.service';
import { BinariesService, normalizeOsArch } from '../binaries/binaries.service';
import { BinaryResourcesService } from '../binaries/binary-resources.service';
import type { QueryBinaryDeploymentDto } from '../binaries/dto/query-binary-resource.dto';
import { generateRealityKeypair } from '../common/inbound';
import { generateAgentToken } from '../common/utils';
import { hashAgentToken } from '../common/agent-token';
import { PrismaService } from '../prisma/prisma.service';
import { ProbeNodeDto } from './dto/probe-node.dto';
import { CreateNodeDto } from './dto/create-node.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import { UpgradeNodeDto } from './dto/upgrade-node.dto';
import { SettingsService } from '../system/settings.service';
import { appendPublicPath, resolvePublicBaseUrl, toWebSocketBaseUrl } from '../common/public-url';
import { encryptSecret } from '../common/secret-crypto';

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
    const agentImage = process.env.AGENT_IMAGE || 'riricloud/agent:latest';
    return {
      node: {
        ...this.sanitize(node),
        installCommands: this.buildInstallCommands(node.osArch, publicBaseUrl),
        agentImage,
        uninstallCommand: this.buildUninstallCommand(),
        windowsUninstallCommand: this.buildWindowsUninstallCommand()
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
    const reachability = dto.reachability ?? 'PUBLIC';
    const serverHost = dto.serverHost?.trim() || (reachability === 'NAT' ? '127.0.0.1' : '');
    if (!serverHost) throw new BadRequestException('节点公网主机地址不能为空');
    const agentToken = generateAgentToken();
    const node = await this.prisma.node.create({
      data: {
        name: dto.name?.trim() || `节点 ${serverHost}`,
        serverHost,
        reachability,
        agentToken: encryptSecret(agentToken),
        agentTokenHash: hashAgentToken(agentToken),
        communicationMode,
        pollIntervalSecs: settings?.defaultPollIntervalSecs ?? 15
      },
      include: nodeLinesInclude
    });
    const agentImage = process.env.AGENT_IMAGE || 'riricloud/agent:latest';
    return {
      node: this.sanitize(node),
      // Token 只在创建成功响应中返回一次；数据库字段保存的是加密密文。
      agentToken,
      installCommand: this.buildInstallCommand(communicationMode, node.osArch, publicBaseUrl),
      installCommands: this.buildInstallCommands(node.osArch, publicBaseUrl),
      agentImage,
      uninstallCommand: this.buildUninstallCommand(),
      windowsUninstallCommand: this.buildWindowsUninstallCommand()
    };
  }

  async rotateToken(id: string, operatorId?: string, requestBaseUrl?: string) {
    const node = await this.requireNode(id);
    if (node.isLocal) throw new ConflictException('主控本机节点请通过重置主控配置轮换凭证');
    const settings = await this.settingsService?.getSettings();
    const publicBaseUrl = resolvePublicBaseUrl({
      configuredBaseUrl: settings?.publicBaseUrl,
      requestBaseUrl
    });
    const token = generateAgentToken();
    await this.prisma.node.update({ where: { id }, data: { agentToken: encryptSecret(token), agentTokenHash: hashAgentToken(token), status: 'OFFLINE' } });
    this.agentGateway.disconnectNode(id);
    const systemLog = (this.prisma as unknown as { systemLog?: { create: (args: Record<string, unknown>) => Promise<unknown> } }).systemLog;
    if (systemLog) {
      await systemLog.create({ data: { source: 'SERVER', level: 'WARN', module: 'Nodes', message: 'AgentToken rotated', metadata: JSON.stringify({ nodeId: id, operatorId: operatorId ?? null }), nodeId: id } });
    }
    const agentImage = process.env.AGENT_IMAGE || 'riricloud/agent:latest';
    const installCommands = this.buildInstallCommands(node.osArch, publicBaseUrl);
    return {
      nodeId: id,
      agentToken: token,
      installCommand: installCommands[node.communicationMode === 'HTTP' ? 'http' : 'ws'],
      installCommands,
      agentImage,
      uninstallCommand: this.buildUninstallCommand(),
      windowsUninstallCommand: this.buildWindowsUninstallCommand()
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

  async listTasks(nodeId: string, query: QueryBinaryDeploymentDto = {}) {
    await this.requireNode(nodeId);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = {
      nodeId,
      ...(query.status ? { status: query.status } : {})
    };
    const [rows, total] = await Promise.all([
      this.prisma.binaryDeploymentTask.findMany({
        where,
        include: {
          asset: {
            select: {
              id: true,
              target: true,
              size: true,
              release: { select: { id: true, kind: true, upstreamVersion: true, revision: true } }
            }
          }
        },
        orderBy: { requestedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.binaryDeploymentTask.count({ where })
    ]);
    return {
      data: rows.map((row) => ({
        ...row,
        version: row.asset?.release ? `${row.asset.release.upstreamVersion}-r${row.asset.release.revision}` : null
      })),
      total,
      page,
      pageSize
    };
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
    const data: { name?: string; serverHost?: string; reachability?: string; configOverride?: string | null; communicationMode?: 'WS' | 'HTTP'; pollIntervalSecs?: number } = {};
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
    if (dto.reachability !== undefined) {
      if (dto.reachability === 'NAT') {
        const activeEntryLines = await this.prisma.line.count({
          where: { entryNodeId: id }
        });
        if (activeEntryLines > 0) {
          throw new BadRequestException('该节点正在作为直连线路或中继入口节点使用，无法变更为 NAT 节点，请先调整相关线路');
        }
      }
      data.reachability = dto.reachability;
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

  /**
   * 组装节点安装命令全集：ws/http/dockerWs/dockerHttp 为兼容保留的旧键，
   * native/portable 按目标操作系统区分（native=注册系统服务，portable=免安装直接运行）。
   */
  private buildInstallCommands(osArch?: string | null, publicBaseUrl?: string) {
    return {
      ws: this.buildInstallCommand('WS', osArch, publicBaseUrl),
      http: this.buildInstallCommand('HTTP', osArch, publicBaseUrl),
      dockerWs: this.buildDockerCommand('WS', publicBaseUrl),
      dockerHttp: this.buildDockerCommand('HTTP', publicBaseUrl),
      native: {
        linux: { ws: this.buildPosixInstallCommand('WS', 'linux', osArch, publicBaseUrl), http: this.buildPosixInstallCommand('HTTP', 'linux', osArch, publicBaseUrl) },
        macos: { ws: this.buildPosixInstallCommand('WS', 'macos', osArch, publicBaseUrl), http: this.buildPosixInstallCommand('HTTP', 'macos', osArch, publicBaseUrl) },
        windows: { ws: this.buildWindowsInstallCommand('WS', osArch, publicBaseUrl), http: this.buildWindowsInstallCommand('HTTP', osArch, publicBaseUrl) }
      },
      portable: {
        linux: { ws: this.buildPosixPortableCommand('WS', 'linux', osArch, publicBaseUrl), http: this.buildPosixPortableCommand('HTTP', 'linux', osArch, publicBaseUrl) },
        macos: { ws: this.buildPosixPortableCommand('WS', 'macos', osArch, publicBaseUrl), http: this.buildPosixPortableCommand('HTTP', 'macos', osArch, publicBaseUrl) },
        windows: { ws: this.buildWindowsPortableCommand('WS', osArch, publicBaseUrl), http: this.buildWindowsPortableCommand('HTTP', osArch, publicBaseUrl) }
      }
    };
  }

  // 旧版键：POSIX 语法 + 随节点 osArch 变化的下载 UA（保持历史行为不变）。
  private buildInstallCommand(mode: 'WS' | 'HTTP', osArch?: string | null, publicBaseUrl?: string) {
    return this.renderPosixInstallCommand(mode, normalizeOsArch(osArch) ?? 'linux-amd64', publicBaseUrl);
  }

  private buildPosixInstallCommand(mode: 'WS' | 'HTTP', targetOs: 'linux' | 'macos', osArch?: string | null, publicBaseUrl?: string) {
    return this.renderPosixInstallCommand(mode, this.resolveTargetPlatform(targetOs, osArch), publicBaseUrl);
  }

  private buildWindowsInstallCommand(mode: 'WS' | 'HTTP', osArch?: string | null, publicBaseUrl?: string) {
    const { master, downloadUrl } = this.resolveModeUrls(mode, publicBaseUrl);
    const platform = this.resolveTargetPlatform('windows', osArch);
    const exe = '$env:ProgramFiles\\RiriCloud\\riri-agent.exe';
    return `$Token = Read-Host 'AgentToken'; curl.exe -fsSL --location -A 'riri-agent-installer/${platform}' -H "X-Agent-Token: $Token" '${downloadUrl}' -o "$env:TEMP\\riri-agent.exe"; New-Item -ItemType Directory -Force "$env:ProgramFiles\\RiriCloud" | Out-Null; Move-Item -Force "$env:TEMP\\riri-agent.exe" "${exe}"; & "${exe}" install --token="$Token" --master=${master}`;
  }

  private buildPosixPortableCommand(mode: 'WS' | 'HTTP', targetOs: 'linux' | 'macos', osArch?: string | null, publicBaseUrl?: string) {
    const { master, downloadUrl } = this.resolveModeUrls(mode, publicBaseUrl);
    const platform = this.resolveTargetPlatform(targetOs, osArch);
    const temp = '/tmp/riri-agent-download';
    return `read -r -s -p 'AgentToken: ' RIRI_AGENT_TOKEN; echo; curl -fsSL --location -A 'riri-agent-installer/${platform}' -H "X-Agent-Token: $RIRI_AGENT_TOKEN" '${downloadUrl}' -o ${temp} && chmod +x ${temp} && RIRICLOUD_DATA_DIR="$HOME/.riri-cloud" AGENT_TOKEN="$RIRI_AGENT_TOKEN" MASTER_URL='${master}' ${temp} run`;
  }

  private buildWindowsPortableCommand(mode: 'WS' | 'HTTP', osArch?: string | null, publicBaseUrl?: string) {
    const { master, downloadUrl } = this.resolveModeUrls(mode, publicBaseUrl);
    const platform = this.resolveTargetPlatform('windows', osArch);
    const dir = '$env:LOCALAPPDATA\\RiriCloud';
    const exe = `${dir}\\riri-agent.exe`;
    return `$Token = Read-Host 'AgentToken'; New-Item -ItemType Directory -Force "${dir}" | Out-Null; curl.exe -fsSL --location -A 'riri-agent-installer/${platform}' -H "X-Agent-Token: $Token" '${downloadUrl}' -o "${exe}"; $env:RIRICLOUD_DATA_DIR = "${dir}"; $env:AGENT_TOKEN = "$Token"; $env:MASTER_URL = '${master}'; & "${exe}" run`;
  }

  // 下载 UA 按目标 OS 归一；节点已上报的 arch 仅在 OS 匹配时复用，否则回退 amd64。
  private resolveTargetPlatform(targetOs: 'linux' | 'macos' | 'windows', osArch?: string | null): string {
    const normalized = normalizeOsArch(osArch);
    if (normalized?.startsWith(`${targetOs}-`)) return normalized;
    return `${targetOs}-amd64`;
  }

  private resolveModeUrls(mode: 'WS' | 'HTTP', publicBaseUrl?: string) {
    const baseUrl = publicBaseUrl ?? resolvePublicBaseUrl();
    return {
      master: mode === 'HTTP' ? baseUrl : appendPublicPath(toWebSocketBaseUrl(baseUrl), 'ws/agent'),
      downloadUrl: appendPublicPath(baseUrl, 'api/v1/downloads/agent')
    };
  }

  private renderPosixInstallCommand(mode: 'WS' | 'HTTP', platform: string, publicBaseUrl?: string) {
    const { master, downloadUrl } = this.resolveModeUrls(mode, publicBaseUrl);
    const temp = '/tmp/riri-agent-download';
    return `read -r -s -p 'AgentToken: ' RIRI_AGENT_TOKEN; echo; curl -fsSL --location -A 'riri-agent-installer/${platform}' -H "X-Agent-Token: $RIRI_AGENT_TOKEN" '${downloadUrl}' -o ${temp} && install -m 0755 ${temp} /usr/local/bin/riri-agent && rm -f ${temp} && /usr/local/bin/riri-agent install --token="$RIRI_AGENT_TOKEN" --master=${master}`;
  }

  private buildDockerCommand(mode: 'WS' | 'HTTP', publicBaseUrl?: string) {
    const baseUrl = publicBaseUrl ?? resolvePublicBaseUrl();
    const master = mode === 'HTTP'
      ? baseUrl
      : appendPublicPath(toWebSocketBaseUrl(baseUrl), 'ws/agent');
    const agentMode = mode === 'HTTP' ? 'http' : 'ws';
    const agentImage = process.env.AGENT_IMAGE || 'riricloud/agent:latest';
    return `read -r -s -p 'AgentToken: ' RIRI_AGENT_TOKEN; echo; docker run -d --name riri-agent --restart unless-stopped --network host --cap-add=NET_ADMIN --cap-add=NET_BIND_SERVICE -v /var/lib/riri-agent:/var/lib/riri-agent -e AGENT_TOKEN="$RIRI_AGENT_TOKEN" -e AGENT_MASTER_URL='${master}' -e AGENT_MODE='${agentMode}' ${agentImage}`;
  }

  private buildUninstallCommand() {
    return 'sudo /usr/local/bin/riri-agent uninstall --purge --yes';
  }

  private buildWindowsUninstallCommand() {
    return '& "$env:ProgramFiles\\RiriCloud\\riri-agent.exe" uninstall --purge --yes';
  }

  private sanitize(node: NodeWithLines): Record<string, unknown> {
    const { entryLines, landingLines, lastProbeResult, capabilitiesJson, agentToken: _agentToken, agentTokenHash: _agentTokenHash, ...rest } = node;
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
    const capabilities = this.parseStringArray(capabilitiesJson);
    return { ...rest, capabilities, supportsMirrorProxy: capabilities.includes('mirror_proxy'), lastProbeResult: this.parseJson(lastProbeResult), lines, entryLines, landingLines, servicePorts };
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

  private parseStringArray(value: string): string[] {
    try {
      const parsed: unknown = JSON.parse(value || '[]');
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }
}
