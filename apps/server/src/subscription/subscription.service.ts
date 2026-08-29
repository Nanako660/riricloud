import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isUserEntitled } from '../common/utils';
import { buildClashYaml, buildSingboxJson, buildVlessUri, type SubNode } from './builders';

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

    const nodes: SubNode[] = await this.prisma.node.findMany({
      where: { isPublic: true, status: { not: 'DISABLED' } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
    });
    const supported = nodes.filter((n) => n.protocol === 'VLESS_REALITY');

    const format = resolveFormat(opts.type, opts.userAgent);
    return {
      body: this.render(format, user.uuid, supported),
      contentType: SUBSCRIPTION_CONTENT_TYPES[format],
      userInfoHeader: this.buildUserInfoHeader(user)
    };
  }

  private render(format: SubscriptionFormat, userUuid: string, nodes: SubNode[]): string {
    switch (format) {
      case 'clash':
        return buildClashYaml(userUuid, nodes);
      case 'singbox':
        return buildSingboxJson(userUuid, nodes);
      default:
        return Buffer.from(nodes.map((n) => buildVlessUri(userUuid, n)).join('\n'), 'utf8').toString('base64');
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
