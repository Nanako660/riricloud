import { Injectable, Logger, NotFoundException, OnModuleDestroy, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { deepMerge, isUserEntitled } from '../common/utils';
import {
  buildClientTls,
  buildClientTransport,
  buildServerInbound,
  normalizeShadowsocksPassword,
  resolveShadowsocksUserPassword,
  type InboundUserCredential
} from '../common/inbound';
import { resolveLineTags } from '../common/line-tags';
import { DEFAULT_INBOUND_LISTEN } from '../common/ports';
import { type ProtocolType } from '../common/constants';
import type {
  AuthResultData,
  AgentPollResponse,
  AgentTaskMessage,
  AgentTransportMode,
  ConfigApplyResultData,
  ConfigSyncData,
  HeartbeatData,
  ProbeRequest,
  ProbeResultData,
  RestartAgentResultData,
  UpgradeResultData,
  UpgradeTarget
} from './agent-message';
import type { AgentPollDto } from './dto/agent-poll.dto';

// 活跃连接注册表：nodeId → WebSocket
export type AgentSocket = { send: (data: string) => void; close: (code?: number, reason?: string) => void };

type SubscriptionUserSnapshot = {
  uuid: string;
  email: string;
  password: string | null;
  isActive: boolean;
};

type SubscriptionSnapshot = {
  status: string;
  trafficLimitBytes: bigint;
  trafficUsedBytes: bigint;
  expireAt: Date | null;
  user: SubscriptionUserSnapshot;
};

type SubscriptionDelegate = {
  findMany: (args: Record<string, unknown>) => Promise<SubscriptionSnapshot[]>;
};

type PendingTask = AgentTaskMessage & { deliveredAt: number };

type TaskResult = {
  taskId: string;
  type: 'upgrade' | 'probe' | 'restart';
  success: boolean;
  message: string;
  completedAt: string;
};

@Injectable()
export class AgentService implements OnModuleDestroy {
  private readonly logger = new Logger(AgentService.name);
  private readonly sockets = new Map<string, AgentSocket>();
  private readonly pendingTasks = new Map<string, PendingTask[]>();
  private readonly taskResults = new Map<string, TaskResult>();
  private readonly configCache = new Map<string, ConfigSyncData>();
  private configVersion = Date.now();
  private configPushTimer?: NodeJS.Timeout;
  private configPushWaiters: Array<(count: number) => void> = [];

  constructor(private prisma: PrismaService) {}

  // 握手鉴权：校验 agentToken，返回鉴权结果与节点
  async authenticate(token: string | undefined): Promise<
    { ok: true; nodeId: string; nodeName: string } | { ok: false; message: string }
  > {
    if (!token) {
      return { ok: false, message: '缺少 token' };
    }
    const node = await this.prisma.node.findUnique({ where: { agentToken: token } });
    if (!node) {
      return { ok: false, message: '无效的 AgentToken' };
    }
    if (node.status === 'DISABLED') {
      return { ok: false, message: '节点已被禁用' };
    }
    return { ok: true, nodeId: node.id, nodeName: node.name };
  }

  // 注册连接并标记上线
  async register(nodeId: string, socket: AgentSocket): Promise<AuthResultData> {
    const existing = this.sockets.get(nodeId);
    if (existing) {
      // 同节点旧连接顶替：新连接优先
      existing.close(4000, 'superseded by new connection');
    }
    this.sockets.set(nodeId, socket);
    await this.prisma.node.update({
      where: { id: nodeId },
      data: { status: 'ONLINE', communicationMode: 'WS', lastSeenAt: new Date() }
    });
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    this.logger.log(`agent online: node=${node?.name ?? nodeId}`);
    return { success: true, message: '鉴权成功', nodeId };
  }

  // 心跳处理：遥测更新 + 流量同事务入库扣减（S6 红线）；内核状态可选字段落列
  async handleHeartbeat(nodeId: string, data: HeartbeatData, mode: AgentTransportMode = 'WS'): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.node.update({
        where: { id: nodeId },
        data: {
          cpuUsage: data.cpuUsage,
          memoryUsage: data.memoryUsage,
          bandwidthRate: data.bandwidthRate,
          lastSeenAt: new Date(),
          status: 'ONLINE',
          communicationMode: mode,
          // 旧版 Agent 不上报内核状态时保持原值（undefined 不写入）
          ...(data.kernelRunning !== undefined ? { kernelRunning: data.kernelRunning } : {}),
          ...(data.lastError !== undefined && data.lastError !== ''
            ? { configError: data.lastError }
            : {}),
          ...(data.lastError === '' ? { configError: null } : {}),
          ...(data.agentVersion !== undefined ? { agentVersion: data.agentVersion } : {}),
          ...(data.osArch !== undefined ? { osArch: data.osArch } : {}),
          ...(data.kernelVersion !== undefined ? { kernelVersion: data.kernelVersion } : {})
        }
      });
      for (const record of data.trafficRecords ?? []) {
        const user = await tx.user.findUnique({ where: { uuid: record.userUuid } });
        if (!user) {
          this.logger.warn('heartbeat: unknown user credential');
          continue;
        }
        await tx.trafficLog.create({
          data: {
            nodeId,
            userId: user.id,
            upload: BigInt(record.upload),
            download: BigInt(record.download)
          }
        });
        await tx.user.update({
          where: { id: user.id },
          data: { trafficUsedBytes: { increment: BigInt(record.upload + record.download) } }
        });
      }
    });
  }

  // HTTP 轮询适配器的单一业务入口：先处理回执，再返回配置差异与待执行任务。
  async poll(token: string | undefined, data: AgentPollDto): Promise<AgentPollResponse> {
    const auth = await this.authenticate(token);
    if (!auth.ok) {
      throw new UnauthorizedException(auth.message);
    }

    // 同一节点切换到 HTTP 后，旧 WS 连接不得继续接收任务或覆盖通信模式。
    this.supersedeSocket(auth.nodeId);
    await this.handleHeartbeat(auth.nodeId, data, 'HTTP');
    for (const result of data.configApplyResults ?? []) {
      await this.handleConfigApplyResult(auth.nodeId, result);
    }
    for (const result of data.upgradeResults ?? []) {
      await this.handleUpgradeResult(auth.nodeId, result);
    }
    for (const result of data.probeResults ?? []) {
      await this.handleProbeResult(auth.nodeId, result);
    }
    for (const result of data.restartAgentResults ?? []) {
      await this.handleRestartResult(auth.nodeId, result);
    }

    const desired = await this.getDesiredConfigSync(auth.nodeId);
    const node = await this.prisma.node.findUnique({
      where: { id: auth.nodeId },
      select: { pollIntervalSecs: true }
    });
    const nextPollSecs = Math.max(5, Math.min(300, node?.pollIntervalSecs ?? 15));
    const needUpdate = data.appliedConfigVersion !== desired.version;
    return {
      needUpdate,
      version: desired.version,
      singboxConfig: needUpdate ? desired.singboxConfig : null,
      tasks: this.takePendingTasks(auth.nodeId),
      nextPollSecs
    };
  }

  // config_apply_result 回执处理：失败原因落 configError（成功清空），供管理端展示
  async handleConfigApplyResult(nodeId: string, data: ConfigApplyResultData): Promise<void> {
    const message = data.success ? null : (data.message?.slice(0, 8192) ?? 'unknown error');
    await this.prisma.node
      .update({ where: { id: nodeId }, data: { configError: message } })
      .catch((err) => this.logger.warn(`config_apply_result: ${err}`));
    if (data.success) {
      this.logger.log(`config applied: node=${nodeId} version=${data.version}`);
    } else {
      this.logger.warn(`config apply failed: node=${nodeId} version=${data.version} error=${data.message}`);
    }
  }

  async handleUpgradeResult(nodeId: string, data: UpgradeResultData): Promise<void> {
    this.acknowledgeTask(nodeId, data.taskId, {
      taskId: data.taskId,
      type: 'upgrade',
      success: data.success,
      message: data.message,
      completedAt: new Date().toISOString()
    });
    const outcome = data.success ? 'succeeded' : 'failed';
    this.logger[data.success ? 'log' : 'warn'](
      `agent upgrade ${outcome}: node=${nodeId} target=${data.target} version=${data.version} task=${data.taskId} message=${data.message}`
    );
  }

  async handleProbeResult(nodeId: string, data: ProbeResultData): Promise<void> {
    const completedAt = new Date().toISOString();
    this.acknowledgeTask(nodeId, data.taskId, {
      taskId: data.taskId,
      type: 'probe',
      success: data.success,
      message: data.results.find((result) => !result.success)?.message ?? (data.success ? 'ok' : 'probe failed'),
      completedAt
    });
    await this.prisma.node.update({
      where: { id: nodeId },
      data: {
        lastProbeResult: JSON.stringify({
          taskId: data.taskId,
          success: data.success,
          results: data.results,
          completedAt
        })
      }
    });
    this.logger.log(
      `agent probe completed: node=${nodeId} task=${data.taskId} success=${data.success} results=${data.results.length}`
    );
  }

  async handleRestartResult(nodeId: string, data: RestartAgentResultData): Promise<void> {
    this.acknowledgeTask(nodeId, data.taskId, {
      taskId: data.taskId,
      type: 'restart',
      success: data.success,
      message: data.message,
      completedAt: new Date().toISOString()
    });
    this.logger[data.success ? 'log' : 'warn'](
      `agent restart ${data.success ? 'succeeded' : 'failed'}: node=${nodeId} task=${data.taskId} message=${data.message}`
    );
  }

  // Line 自己拥有协议与端点：同一条 Line 在出口节点生成协议入站，
  // 中继线路再按入口角色追加盲转发或协议代理配置。
  async buildConfigSync(nodeId: string): Promise<ConfigSyncData> {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      include: {
        entryLines: {
          where: { status: 'ACTIVE' },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: { exitNode: true }
        },
        exitLines: {
          where: { status: 'ACTIVE' },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: { entryNode: true }
        }
      }
    });
    if (!node) {
      throw new NotFoundException('节点不存在');
    }

    // vless/tuic 用 uuid 登录；hy2 的 password 回退 uuid（与订阅输出一致，见 docs/DATA_MODELS.md §3.1）
    const subscriptionDelegate = (this.prisma as unknown as { subscription?: SubscriptionDelegate }).subscription;
    let users: InboundUserCredential[];
    if (subscriptionDelegate) {
      const subscriptions = await subscriptionDelegate.findMany({
        where: { status: { in: ['ACTIVE', 'CANCELED'] } },
        include: { user: { select: { uuid: true, email: true, password: true, isActive: true } } }
      });
      users = subscriptions
        .filter((subscription) =>
          subscription.user.isActive &&
          subscription.trafficUsedBytes < subscription.trafficLimitBytes &&
          (!subscription.expireAt || subscription.expireAt.getTime() > Date.now())
        )
        .map((subscription) => ({
          uuid: subscription.user.uuid,
          email: subscription.user.email,
          credential: subscription.user.password ?? subscription.user.uuid
        }));
    } else {
      const entitledUsers = await this.prisma.user.findMany({
        where: { isActive: true },
        select: { uuid: true, email: true, password: true, isActive: true, expireAt: true, trafficLimitBytes: true, trafficUsedBytes: true }
      });
      users = entitledUsers
        .filter(isUserEntitled)
        .map((u) => ({ uuid: u.uuid, email: u.email, credential: u.password ?? u.uuid }));
    }

    type ConfigLine = {
      id: string;
      tag: string | null;
      listen: string;
      type: string;
      relayMode: string | null;
      protocolType: string;
      paramsJson: string;
      entryNodeId: string;
      entryPort: number;
      exitNodeId: string;
      exitPort: number;
      exitNode: { serverHost: string };
    };
    const lines = new Map<string, ConfigLine>();
    for (const line of node.entryLines ?? []) lines.set(line.id, line);
    for (const line of node.exitLines ?? []) {
      if (!lines.has(line.id)) {
        lines.set(line.id, { ...line, exitNode: { serverHost: node.serverHost } });
      }
    }

    const inbounds: Array<Record<string, unknown>> = [];
    const outbounds: Array<Record<string, unknown>> = [{ type: 'direct', tag: 'direct' }];
    const relayRules: Array<Record<string, unknown>> = [];
    for (const line of lines.values()) {
      const protocolType = line.protocolType as ProtocolType;
      const params = JSON.parse(line.paramsJson) as Record<string, unknown>;
      const lineTags = resolveLineTags(line);
      const isEntry = line.entryNodeId === nodeId;
      const isExit = line.exitNodeId === nodeId;
      if (line.type === 'DIRECT' && isEntry) {
        inbounds.push(buildServerInbound({
          type: protocolType,
          tag: lineTags.direct ?? `line-${line.id}`,
          listen: line.listen || DEFAULT_INBOUND_LISTEN,
          port: line.entryPort,
          params,
          users
        }));
        continue;
      }

      if (isEntry && line.relayMode === 'BLIND_FORWARD') {
        inbounds.push({
          type: 'direct',
          tag: lineTags.entry ?? `relay-${line.id}-entry`,
          listen: line.listen || DEFAULT_INBOUND_LISTEN,
          listen_port: line.entryPort,
          override_address: line.exitNode.serverHost,
          override_port: line.exitPort
        });
      }

      if (isEntry && line.relayMode === 'PROTOCOL_PROXY') {
        const relayTag = lineTags.entry ?? `relay-${line.id}-entry`;
        inbounds.push(
          buildServerInbound({
            type: protocolType,
            tag: relayTag,
            listen: line.listen || DEFAULT_INBOUND_LISTEN,
            port: line.entryPort,
            params,
            users
          })
        );
        const outbound = this.buildProtocolRelayOutbound(line, users);
        if (!outbound) {
          inbounds.pop();
          continue;
        }
        outbounds.push(outbound);
        relayRules.push({ inbound: [relayTag], outbound: `relay-out-${line.id}` });
      }

      if (isExit) {
        inbounds.push(buildServerInbound({
          type: protocolType,
          tag: lineTags.exit ?? `line-${line.id}-exit`,
          listen: line.listen || DEFAULT_INBOUND_LISTEN,
          port: line.exitPort,
          params,
          users
        }));
      }
    }

    let singboxConfig: Record<string, unknown> = {
      log: { level: 'info', timestamp: true },
      inbounds,
      outbounds,
      ...(relayRules.length ? { route: { rules: relayRules } } : {})
    };
    if (node.configOverride) {
      singboxConfig = deepMerge(singboxConfig, JSON.parse(node.configOverride) as Record<string, unknown>);
    }
    return { version: ++this.configVersion, singboxConfig };
  }

  private async getDesiredConfigSync(nodeId: string): Promise<ConfigSyncData> {
    const cached = this.configCache.get(nodeId);
    if (cached) return cached;
    const payload = await this.buildConfigSync(nodeId);
    this.configCache.set(nodeId, payload);
    return payload;
  }

  private buildProtocolRelayOutbound(
    line: {
      id: string;
      protocolType: string;
      paramsJson: string;
      exitPort: number;
      exitNode: { serverHost: string };
    },
    users: InboundUserCredential[]
  ): Record<string, unknown> | undefined {
    const protocolType = line.protocolType as ProtocolType;
    const params = JSON.parse(line.paramsJson) as Record<string, unknown>;
    const firstUser = users[0] ?? { uuid: randomUUID(), email: 'relay', credential: randomUUID() };
    const tls = (params.tls ?? {}) as Record<string, unknown>;
    const reality = tls.reality as Record<string, unknown> | undefined;
    const fallbackServerName = typeof tls.serverName === 'string'
      ? tls.serverName
      : reality && Array.isArray(reality.serverNames) && typeof reality.serverNames[0] === 'string'
        ? reality.serverNames[0]
        : undefined;
    const tlsServerName = fallbackServerName;
    const outbound: Record<string, unknown> = {
      type: protocolType.toLowerCase(),
      tag: `relay-out-${line.id}`,
      server: line.exitNode.serverHost,
      server_port: line.exitPort
    };

    switch (protocolType) {
      case 'VLESS':
        outbound.uuid = firstUser.uuid;
        if (typeof params.flow === 'string') outbound.flow = params.flow;
        break;
      case 'VMESS':
        outbound.uuid = firstUser.uuid;
        outbound.alter_id = typeof params.alterId === 'number' ? params.alterId : 0;
        outbound.security = 'auto';
        break;
      case 'TROJAN':
        outbound.password = firstUser.credential;
        break;
      case 'HYSTERIA2':
        outbound.password = firstUser.credential;
        if (typeof params.upMbps === 'number') outbound.up_mbps = params.upMbps;
        if (typeof params.downMbps === 'number') outbound.down_mbps = params.downMbps;
        if (params.obfs) outbound.obfs = params.obfs;
        break;
      case 'TUIC':
        outbound.uuid = firstUser.uuid;
        outbound.password = firstUser.credential;
        outbound.congestion_control = typeof params.congestionControl === 'string' ? params.congestionControl : 'bbr';
        if (params.zeroRttHandshake === true) outbound.zero_rtt_handshake = true;
        break;
      case 'SHADOWSOCKS':
        outbound.method = typeof params.method === 'string' ? params.method : '2022-blake3-aes-128-gcm';
        outbound.password = params.mode === 'multi-user'
          ? resolveShadowsocksUserPassword(outbound.method as string, firstUser.credential, firstUser.uuid)
          : normalizeShadowsocksPassword(outbound.method as string, typeof params.password === 'string' ? params.password : '');
        break;
      case 'NAIVE':
        outbound.username = firstUser.email;
        outbound.password = firstUser.credential;
        break;
      default:
        outbound.type = 'direct';
        break;
    }

    const clientTls = buildClientTls(
      tls as unknown as Parameters<typeof buildClientTls>[0],
      tlsServerName,
      protocolType === 'NAIVE' ? { includeAlpn: false } : undefined
    );
    if (clientTls) outbound.tls = clientTls;
    const transport = (params.transport ?? {}) as Record<string, unknown>;
    const clientTransport = buildClientTransport(
      transport as unknown as Parameters<typeof buildClientTransport>[0],
      null
    );
    if (clientTransport) outbound.transport = clientTransport;
    return outbound;
  }

  // 向指定节点推送配置（reload 触发）
  async pushConfig(nodeId: string): Promise<boolean> {
    try {
      const payload = await this.buildConfigSync(nodeId);
      this.configCache.set(nodeId, payload);
      const socket = this.sockets.get(nodeId);
      if (!socket) {
        const node = await this.prisma.node.findUnique({
          where: { id: nodeId },
          select: { status: true, communicationMode: true }
        });
        return node?.status === 'ONLINE' && node.communicationMode === 'HTTP';
      }
      socket.send(JSON.stringify({ type: 'config_sync', data: payload }));
      return true;
    } catch (err) {
      this.logger.error(`pushConfig failed for node=${nodeId}: ${err}`);
      return false;
    }
  }

  // 用户增删/资格变动时向全部在线节点推送（协议约定见 docs/API_AND_PROTOCOLS.md §2.2）
  async pushConfigToAll(): Promise<number> {
    this.configCache.clear();
    return new Promise((resolve) => {
      this.configPushWaiters.push(resolve);
      if (this.configPushTimer) clearTimeout(this.configPushTimer);
      this.configPushTimer = setTimeout(() => {
        this.configPushTimer = undefined;
        void this.flushConfigToAll().then((count) => {
          const waiters = this.configPushWaiters.splice(0);
          waiters.forEach((waiter) => waiter(count));
        });
      }, 250);
    });
  }

  private async flushConfigToAll(): Promise<number> {
    let pushed = 0;
    for (const nodeId of this.sockets.keys()) {
      if (await this.pushConfig(nodeId)) {
        pushed += 1;
      }
    }
    if (pushed > 0) {
      this.logger.log(`config_sync pushed to ${pushed} online node(s)`);
    }
    return pushed;
  }

  async requestUpgrade(nodeId: string, target: UpgradeTarget, version: string, url: string, sha256: string) {
    if (!/^https?:\/\//i.test(url)) throw new Error('upgrade URL must use http or https');
    if (!/^[a-f0-9]{64}$/i.test(sha256)) throw new Error('upgrade sha256 must be 64 hexadecimal characters');
    const taskId = randomUUID();
    const sent = await this.sendTask(nodeId, 'upgrade_task', { taskId, target, version, url, sha256 });
    return { taskId, requested: sent };
  }

  async requestProbe(nodeId: string, probes: ProbeRequest[]) {
    if (!probes.length || probes.length > 8) throw new Error('probe task must contain 1 to 8 probes');
    const taskId = randomUUID();
    const sent = await this.sendTask(nodeId, 'probe_task', { taskId, probes });
    return { taskId, requested: sent };
  }

  async requestRestart(nodeId: string) {
    const taskId = randomUUID();
    const sent = await this.sendTask(nodeId, 'restart_agent_task', { taskId });
    return { taskId, requested: sent };
  }

  private async sendTask(nodeId: string, type: 'upgrade_task' | 'probe_task' | 'restart_agent_task', data: unknown): Promise<boolean> {
    const socket = this.sockets.get(nodeId);
    if (socket) {
      try {
        socket.send(JSON.stringify({ type, data }));
        return true;
      } catch (err) {
        this.logger.warn(`send agent task failed: node=${nodeId} type=${type} error=${err}`);
        return false;
      }
    }

    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: { status: true, communicationMode: true }
    });
    if (node?.status !== 'ONLINE' || node.communicationMode !== 'HTTP') return false;
    const task = { type, data } as AgentTaskMessage;
    const tasks = this.pendingTasks.get(nodeId) ?? [];
    tasks.push({ ...task, deliveredAt: 0 } as PendingTask);
    this.pendingTasks.set(nodeId, tasks);
    return true;
  }

  private takePendingTasks(nodeId: string): AgentTaskMessage[] {
    const tasks = this.pendingTasks.get(nodeId) ?? [];
    const now = Date.now();
    const selected = tasks.filter((task) => task.deliveredAt === 0 || now - task.deliveredAt >= 60_000).slice(0, 8);
    selected.forEach((task) => { task.deliveredAt = now; });
    return selected.map((task): AgentTaskMessage => {
      if (task.type === 'upgrade_task') return { type: 'upgrade_task', data: task.data };
      if (task.type === 'probe_task') return { type: 'probe_task', data: task.data };
      return { type: 'restart_agent_task', data: task.data };
    });
  }

  private acknowledgeTask(nodeId: string, taskId: string, result: TaskResult) {
    const tasks = this.pendingTasks.get(nodeId);
    if (tasks) {
      const remaining = tasks.filter((task) => {
        const candidate = task.data as { taskId?: string };
        return candidate.taskId !== taskId;
      });
      if (remaining.length) this.pendingTasks.set(nodeId, remaining);
      else this.pendingTasks.delete(nodeId);
    }
    this.taskResults.set(`${nodeId}:${taskId}`, result);
  }

  getTaskStatus(nodeId: string, taskId: string) {
    const result = this.taskResults.get(`${nodeId}:${taskId}`);
    if (result) return { ...result, status: 'COMPLETED' as const };
    const queued = (this.pendingTasks.get(nodeId) ?? []).some((task) => (task.data as { taskId?: string }).taskId === taskId);
    return { taskId, status: queued ? 'QUEUED' as const : 'PENDING' as const };
  }

  // 断开：置离线并移除注册
  async unregister(nodeId: string, socket?: AgentSocket): Promise<void> {
    if (socket && this.sockets.get(nodeId) !== socket) {
      return;
    }
    this.sockets.delete(nodeId);
    this.logger.log(`agent offline: nodeId=${nodeId}`);
  }

  isCurrentSocket(nodeId: string, socket: AgentSocket): boolean {
    return this.sockets.get(nodeId) === socket;
  }

  private supersedeSocket(nodeId: string): void {
    const socket = this.sockets.get(nodeId);
    if (!socket) return;
    this.sockets.delete(nodeId);
    try {
      socket.close(4002, 'switched to HTTP polling');
    } catch (err) {
      this.logger.warn(`close superseded agent socket failed: node=${nodeId} error=${err}`);
    }
    this.logger.log(`agent WS superseded by HTTP polling: node=${nodeId}`);
  }

  // 节点删除前断开其在线 Agent：只移除注册与关闭连接，不写库（节点即将删除）
  disconnectNode(nodeId: string): boolean {
    const socket = this.sockets.get(nodeId);
    if (!socket) {
      return false;
    }
    this.sockets.delete(nodeId);
    socket.close(4001, 'node deleted');
    this.logger.log(`agent disconnected: node=${nodeId} (deleted)`);
    return true;
  }

  // 心跳超时扫描：超过阈值未心跳的在线节点置离线
  async sweepStaleNodes(): Promise<void> {
    const nodes = await this.prisma.node.findMany({
      where: { status: 'ONLINE' },
      select: { id: true, communicationMode: true, pollIntervalSecs: true, lastSeenAt: true }
    });
    const now = Date.now();
    const staleIds = nodes
      .filter((node) => {
        if (!node.lastSeenAt) return true;
        const thresholdMs = node.communicationMode === 'HTTP'
          ? Math.max(15_000, node.pollIntervalSecs * 3_000)
          : 15_000;
        return now - node.lastSeenAt.getTime() > thresholdMs;
      })
      .map((node) => node.id);
    if (staleIds.length) {
      await this.prisma.node.updateMany({
        where: { id: { in: staleIds }, status: 'ONLINE' },
        data: { status: 'OFFLINE' }
      });
    }
  }

  onModuleDestroy() {
    if (this.configPushTimer) clearTimeout(this.configPushTimer);
    this.configPushWaiters.splice(0).forEach((waiter) => waiter(0));
    for (const [, socket] of this.sockets) {
      socket.close(1001, 'server shutdown');
    }
    this.sockets.clear();
    this.pendingTasks.clear();
    this.taskResults.clear();
    this.configCache.clear();
  }
}

// 旧名称作为导出别名保留，避免已有测试和扩展模块被无意义地打断。
export { AgentService as AgentGatewayService };
