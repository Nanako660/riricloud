import { Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { deepMerge, isUserEntitled } from '../common/utils';
import { buildServerInbound, type InboundUserCredential } from '../common/inbound';
import type { ProtocolType } from '../common/constants';
import type { AuthResultData, ConfigApplyResultData, ConfigSyncData, HeartbeatData } from './agent-message';

// 活跃连接注册表：nodeId → WebSocket
export type AgentSocket = { send: (data: string) => void; close: (code?: number, reason?: string) => void };

@Injectable()
export class AgentGatewayService implements OnModuleDestroy {
  private readonly logger = new Logger(AgentGatewayService.name);
  private readonly sockets = new Map<string, AgentSocket>();
  private configVersion = Date.now();

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
          this.logger.warn(`heartbeat: unknown userUuid=${record.userUuid}`);
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

  // 组装完整 Sing-box 服务端配置：入站数组逐条按协议生成（users 为有资格用户注入），
  // configOverride 顶层深合并（数组整体替换，含 inbounds 则覆盖整组入站）
  async buildConfigSync(nodeId: string): Promise<ConfigSyncData> {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      include: { inbounds: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } }
    });
    if (!node) {
      throw new NotFoundException('节点不存在');
    }

    // vless/tuic 用 uuid 登录；hy2 的 password 回退 uuid（与订阅输出一致，见 docs/DATA_MODELS.md §3.1）
    const entitledUsers = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { uuid: true, email: true, password: true, isActive: true, expireAt: true, trafficLimitBytes: true, trafficUsedBytes: true }
    });
    const users: InboundUserCredential[] = entitledUsers
      .filter(isUserEntitled)
      .map((u) => ({ uuid: u.uuid, email: u.email, credential: u.password ?? u.uuid }));

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

    let singboxConfig: Record<string, unknown> = {
      log: { level: 'info', timestamp: true },
      inbounds,
      outbounds: [{ type: 'direct', tag: 'direct' }]
    };
    if (node.configOverride) {
      singboxConfig = deepMerge(singboxConfig, JSON.parse(node.configOverride) as Record<string, unknown>);
    }
    return { version: ++this.configVersion, singboxConfig };
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

  // 断开：置离线并移除注册
  async unregister(nodeId: string): Promise<void> {
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
    for (const [, socket] of this.sockets) {
      socket.close(1001, 'server shutdown');
    }
    this.sockets.clear();
  }
}
