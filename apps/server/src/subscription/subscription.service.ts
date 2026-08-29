import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isUserEntitled } from '../common/utils';
import type { ProtocolType } from '../common/constants';
import {
  buildClashYaml,
  buildSingboxJson,
  buildUriList,
  type SubNode,
  type SubUser
} from './builders';

export type SubscriptionFormat = 'base64' | 'clash' | 'singbox';

export const SUBSCRIPTION_CONTENT_TYPES: Record<SubscriptionFormat, string> = {
  base64: 'text/plain; charset=utf-8',
  clash: 'text/yaml; charset=utf-8',
  singbox: 'application/json; charset=utf-8'
};

// 格式协商：显式 ?type= 优先，其次 User-Agent 嗅探，默认 Base64（docs/API_AND_PROTOCOLS.md §3.1）
export function resolveFormat(type?: string, userAgent?: string): SubscriptionFormat {
  const t = (type ?? '').trim().toLowerCase();
  if (t === 'clash') {
    return 'clash';
  }
  if (t === 'sing-box' || t === 'singbox') {
    return 'singbox';
  }
  const ua = userAgent ?? '';
  if (/clash|meta|mihomo/i.test(ua)) {
    return 'clash';
  }
  if (/sing-?box/i.test(ua)) {
    return 'singbox';
  }
  return 'base64';
}

@Injectable()
export class SubscriptionService {
  constructor(private prisma: PrismaService) {}

  async getSubscription(token: string, opts: { type?: string; userAgent?: string } = {}) {
    const user = await this.prisma.user.findUnique({ where: { subscriptionToken: token } });
    if (!user) {
      throw new NotFoundException('订阅不存在');
    }
    if (!isUserEntitled(user)) {
      throw new ForbiddenException('账号已过期、被禁用或超出流量配额');
    }

    // 逐入站生成订阅条目：仅公开节点的公开入站（isPublic 语义见 docs/DATA_MODELS.md §NodeInbound）
    const nodes = await this.prisma.node.findMany({
      where: { isPublic: true, status: { not: 'DISABLED' } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        inbounds: {
          where: { isPublic: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
        }
      }
    });
    const subNodes: SubNode[] = nodes.map((node) => ({
      name: node.name,
      serverHost: node.serverHost,
      inbounds: node.inbounds.map((inbound) => ({
        type: inbound.type as ProtocolType,
        tag: inbound.tag,
        port: inbound.port,
        params: JSON.parse(inbound.paramsJson) as Record<string, unknown>
      }))
    }));

    // vless/tuic 用 uuid 登录；hy2/tuic 密码回退 uuid（与 config_sync 用户注入一致）
    const subUser: SubUser = { uuid: user.uuid, credential: user.password ?? user.uuid };
    const format = resolveFormat(opts.type, opts.userAgent);
    return {
      body: this.render(format, subUser, subNodes),
      contentType: SUBSCRIPTION_CONTENT_TYPES[format],
      userInfoHeader: this.buildUserInfoHeader(user)
    };
  }

  private render(format: SubscriptionFormat, user: SubUser, nodes: SubNode[]): string {
    switch (format) {
      case 'clash':
        return buildClashYaml(user, nodes);
      case 'singbox':
        return buildSingboxJson(user, nodes);
      default:
        return Buffer.from(buildUriList(user, nodes).join('\n'), 'utf-8').toString('base64');
    }
  }

  // Subscription-Userinfo: upload=..; download=..; total=..; expire=..
  private buildUserInfoHeader(user: {
    trafficLimitBytes: bigint;
    trafficUsedBytes: bigint;
    expireAt: Date | null;
  }): string {
    const expire = user.expireAt ? Math.floor(user.expireAt.getTime() / 1000) : 0;
    // upload/download 拆分暂无来源（TrafficLog 按用户聚合待 WS 流量上报落地），先以 0/总量近似
    return `upload=0; download=${user.trafficUsedBytes}; total=${user.trafficLimitBytes}; expire=${expire}`;
  }
}
