import { Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
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
import { DEFAULT_INBOUND_LISTEN } from '../common/ports';
import { PROTOCOL_PROXY_TARGET_TYPES, type ProtocolType } from '../common/constants';
import type {
  AuthResultData,
  ConfigApplyResultData,
  ConfigSyncData,
  HeartbeatData,
  ProbeRequest,
  ProbeResultData,
  UpgradeResultData,
  UpgradeTarget
} from './agent-message';

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

@Injectable()
export class AgentGatewayService implements OnModuleDestroy {
  private readonly logger = new Logger(AgentGatewayService.name);
  private readonly sockets = new Map<string, AgentSocket>();
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
      data: { status: 'ONLINE', lastSeenAt: new Date() }
    });
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    this.logger.log(`agent online: node=${node?.name ?? nodeId}`);
    return { success: true, message: '鉴权成功', nodeId };
  }

  // 心跳处理：遥测更新 + 流量同事务入库扣减（S6 红线）；内核状态可选字段落列
  async handleHeartbeat(nodeId: string, data: HeartbeatData): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.node.update({
        where: { id: nodeId },
        data: {
          cpuUsage: data.cpuUsage,
          memoryUsage: data.memoryUsage,
          bandwidthRate: data.bandwidthRate,
          lastSeenAt: new Date(),
          status: 'ONLINE',
          // 旧版 Agent 不上报内核状态时保持原值（undefined 不写入）
          ...(data.kernelRunning !== undefined ? { kernelRunning: data.kernelRunning } : {}),
          ...(data.lastError !== undefined && data.lastError !== ''
            ? { configError: data.lastError }
            : {}),
          ...(data.lastError === '' ? { configError: null } : {})
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
    const outcome = data.success ? 'succeeded' : 'failed';
    this.logger[data.success ? 'log' : 'warn'](
      `agent upgrade ${outcome}: node=${nodeId} target=${data.target} version=${data.version} task=${data.taskId} message=${data.message}`
    );
  }

  async handleProbeResult(nodeId: string, data: ProbeResultData): Promise<void> {
    this.logger.log(
      `agent probe completed: node=${nodeId} task=${data.taskId} success=${data.success} results=${data.results.length}`
    );
  }

  // 组装完整 Sing-box 服务端配置：入站数组逐条按协议生成（users 为有资格用户注入），
  // configOverride 顶层深合并（数组整体替换，含 inbounds 则覆盖整组入站）
  async buildConfigSync(nodeId: string): Promise<ConfigSyncData> {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      include: {
        inbounds: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        entryLines: {
          where: { status: 'ACTIVE' },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: {
            targetInbound: { include: { node: true } }
          }
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

    const inbounds = node.inbounds.map((inbound) =>
      buildServerInbound({
        type: inbound.type as ProtocolType,
        tag: inbound.tag,
        listen: inbound.listen,
        port: inbound.port,
        params: JSON.parse(inbound.paramsJson) as Record<string, unknown>,
        users
      })
    );

    const outbounds: Array<Record<string, unknown>> = [{ type: 'direct', tag: 'direct' }];
    const relayRules: Array<Record<string, unknown>> = [];
    for (const line of node.entryLines ?? []) {
      if (!line.entryPort) continue;
      const target = line.targetInbound;
      const relayTag = `relay-${line.id}`;
      if (line.relayMode === 'BLIND_FORWARD') {
        inbounds.push({
          type: 'direct',
          tag: relayTag,
          listen: DEFAULT_INBOUND_LISTEN,
          listen_port: line.entryPort,
          override_address: target.node.serverHost,
          override_port: target.port
        });
        continue;
      }

      if (line.relayMode === 'PROTOCOL_PROXY') {
        if (!PROTOCOL_PROXY_TARGET_TYPES.includes(target.type as (typeof PROTOCOL_PROXY_TARGET_TYPES)[number])) {
          continue;
        }
        inbounds.push(
          buildServerInbound({
            type: target.type as ProtocolType,
            tag: relayTag,
            listen: DEFAULT_INBOUND_LISTEN,
            port: line.entryPort,
            params: JSON.parse(target.paramsJson) as Record<string, unknown>,
            users
          })
        );
        const outbound = this.buildProtocolRelayOutbound(line, target, users);
        if (!outbound) {
          inbounds.pop();
          continue;
        }
        outbounds.push(outbound);
        relayRules.push({ inbound: [relayTag], outbound: `relay-out-${line.id}` });
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

  private buildProtocolRelayOutbound(
    line: {
      id: string;
      endpointOverrideEnabled?: boolean;
      serverName: string | null;
      host: string | null;
    },
    target: { type: string; port: number; paramsJson: string; node: { serverHost: string } },
    users: InboundUserCredential[]
  ): Record<string, unknown> | undefined {
    const params = JSON.parse(target.paramsJson) as Record<string, unknown>;
    const firstUser = users[0] ?? { uuid: randomUUID(), email: 'relay', credential: randomUUID() };
    const tls = (params.tls ?? {}) as Record<string, unknown>;
    const useOverrides = line.endpointOverrideEnabled !== false;
    const reality = tls.reality as Record<string, unknown> | undefined;
    const fallbackServerName = typeof tls.serverName === 'string'
      ? tls.serverName
      : reality && Array.isArray(reality.serverNames) && typeof reality.serverNames[0] === 'string'
        ? reality.serverNames[0]
        : undefined;
    const tlsServerName = useOverrides && line.serverName
      ? line.serverName
      : fallbackServerName;
    const outbound: Record<string, unknown> = {
      type: target.type.toLowerCase(),
      tag: `relay-out-${line.id}`,
      server: target.node.serverHost,
      server_port: target.port
    };

    switch (target.type) {
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
      target.type === 'NAIVE' ? { includeAlpn: false } : undefined
    );
    if (clientTls) outbound.tls = clientTls;
    const transport = (params.transport ?? {}) as Record<string, unknown>;
    const clientTransport = buildClientTransport(
      transport as unknown as Parameters<typeof buildClientTransport>[0],
      useOverrides ? line.host : null
    );
    if (clientTransport) outbound.transport = clientTransport;
    return outbound;
  }

  // 向指定节点推送配置（reload 触发）
  async pushConfig(nodeId: string): Promise<boolean> {
    const socket = this.sockets.get(nodeId);
    if (!socket) {
      return false;
    }
    try {
      const payload = await this.buildConfigSync(nodeId);
      socket.send(JSON.stringify({ type: 'config_sync', data: payload }));
      return true;
    } catch (err) {
      this.logger.error(`pushConfig failed for node=${nodeId}: ${err}`);
      return false;
    }
  }

  // 用户增删/资格变动时向全部在线节点推送（协议约定见 docs/API_AND_PROTOCOLS.md §2.2）
  async pushConfigToAll(): Promise<number> {
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
    const sent = this.sendTask(nodeId, 'upgrade_task', { taskId, target, version, url, sha256 });
    return { taskId, requested: sent };
  }

  async requestProbe(nodeId: string, probes: ProbeRequest[]) {
    if (!probes.length || probes.length > 8) throw new Error('probe task must contain 1 to 8 probes');
    const taskId = randomUUID();
    const sent = this.sendTask(nodeId, 'probe_task', { taskId, probes });
    return { taskId, requested: sent };
  }

  private sendTask(nodeId: string, type: string, data: unknown): boolean {
    const socket = this.sockets.get(nodeId);
    if (!socket) return false;
    try {
      socket.send(JSON.stringify({ type, data }));
      return true;
    } catch (err) {
      this.logger.warn(`send agent task failed: node=${nodeId} type=${type} error=${err}`);
      return false;
    }
  }

  // 断开：置离线并移除注册
  async unregister(nodeId: string, socket?: AgentSocket): Promise<void> {
    if (socket && this.sockets.get(nodeId) !== socket) {
      return;
    }
    this.sockets.delete(nodeId);
    await this.prisma.node
      .update({ where: { id: nodeId }, data: { status: 'OFFLINE' } })
      .catch(() => undefined);
    this.logger.log(`agent offline: nodeId=${nodeId}`);
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
    const threshold = new Date(Date.now() - 30_000);
    await this.prisma.node.updateMany({
      where: { status: 'ONLINE', lastSeenAt: { lt: threshold } },
      data: { status: 'OFFLINE' }
    });
  }

  onModuleDestroy() {
    if (this.configPushTimer) clearTimeout(this.configPushTimer);
    this.configPushWaiters.splice(0).forEach((waiter) => waiter(0));
    for (const [, socket] of this.sockets) {
      socket.close(1001, 'server shutdown');
    }
    this.sockets.clear();
  }
}
