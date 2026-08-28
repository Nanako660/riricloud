import { Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isUserEntitled } from '../common/utils';
import type { AuthResultData, ConfigSyncData, HeartbeatData } from './agent-message';

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

  // 心跳处理：遥测更新 + 流量同事务入库扣减（S6 红线）
  async handleHeartbeat(nodeId: string, data: HeartbeatData): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.node.update({
        where: { id: nodeId },
        data: {
          cpuUsage: data.cpuUsage,
          memoryUsage: data.memoryUsage,
          bandwidthRate: data.bandwidthRate,
          lastSeenAt: new Date(),
          status: 'ONLINE'
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

  // 组装完整 Sing-box 服务端配置（活跃用户注入 vless users 列表）
  async buildConfigSync(nodeId: string): Promise<ConfigSyncData> {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) {
      throw new NotFoundException('节点不存在');
    }
    const reality = node.configPayload
      ? (JSON.parse(node.configPayload) as {
          serverNames: string[];
          dest: string;
          privateKey: string;
          shortIds: string[];
        })
      : null;

    const entitledUsers = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { uuid: true, email: true, isActive: true, expireAt: true, trafficLimitBytes: true, trafficUsedBytes: true }
    });
    const users = entitledUsers
      .filter(isUserEntitled)
      .map((u) => ({ uuid: u.uuid, name: u.email, flow: 'xtls-rprx-vision' }));

    const singboxConfig: Record<string, unknown> = {
      log: { level: 'info', timestamp: true },
      inbounds: reality
        ? [
            {
              type: 'vless',
              tag: 'vless-in',
              listen: '::',
              listen_port: node.serverPort,
              users,
              tls: {
                enabled: true,
                server_name: reality.serverNames[0],
                reality: {
                  enabled: true,
                  handshake: { server: reality.dest, server_port: 443 },
                  private_key: reality.privateKey,
                  short_id: reality.shortIds
                }
              }
            }
          ]
        : [],
      outbounds: [{ type: 'direct', tag: 'direct' }]
    };
    return { version: ++this.configVersion, singboxConfig };
  }

  // 向指定节点推送配置（reload 触发）
  async pushConfig(nodeId: string): Promise<boolean> {
    const socket = this.sockets.get(nodeId);
    if (!socket) {
      return false;
    }
    const payload = await this.buildConfigSync(nodeId);
    socket.send(JSON.stringify({ type: 'config_sync', data: payload }));
    return true;
  }

  // 断开：置离线并移除注册
  async unregister(nodeId: string): Promise<void> {
    this.sockets.delete(nodeId);
    await this.prisma.node
      .update({ where: { id: nodeId }, data: { status: 'OFFLINE' } })
      .catch(() => undefined);
    this.logger.log(`agent offline: nodeId=${nodeId}`);
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
