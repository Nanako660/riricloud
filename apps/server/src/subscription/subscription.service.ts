import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isUserEntitled } from '../common/utils';

// Reality 客户端参数须与节点 configPayload 一致（当前为演示默认值）
const REALITY_CLIENT_DEFAULTS = {
  sni: 'www.apple.com',
  fp: 'chrome'
};

@Injectable()
export class SubscriptionService {
  constructor(private prisma: PrismaService) {}

  async getSubscription(token: string, _userAgent?: string) {
    const user = await this.prisma.user.findUnique({ where: { subscriptionToken: token } });
    if (!user) {
      throw new NotFoundException('订阅不存在');
    }
    if (!isUserEntitled(user)) {
      throw new ForbiddenException('账号已过期、被禁用或超出流量配额');
    }

    const nodes = await this.prisma.node.findMany({
      where: { isPublic: true, status: { not: 'DISABLED' } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
    });

    const uris: string[] = [];
    for (const node of nodes) {
      if (node.protocol === 'VLESS_REALITY') {
        uris.push(this.buildVlessUri(user.uuid, node));
      }
    }

    const body = Buffer.from(uris.join('\n'), 'utf8').toString('base64');
    return {
      body,
      userInfoHeader: this.buildUserInfoHeader(user)
    };
  }

  // vless://<uuid>@<host>:<port>?encryption=none&flow=xtls-rprx-vision&security=reality&sni=..&fp=chrome&pbk=..&sid=..&type=tcp#<name>
  private buildVlessUri(
    userUuid: string,
    node: {
      name: string;
      serverHost: string;
      serverPort: number;
      configPayload: string | null;
    }
  ): string {
    const config = node.configPayload ? (JSON.parse(node.configPayload) as {
      publicKey?: string;
      serverNames?: string[];
      shortIds?: string[];
    }) : {};
    const sni = config.serverNames?.[0] ?? REALITY_CLIENT_DEFAULTS.sni;
    const pbk = config.publicKey ?? '';
    const sid = config.shortIds?.[0] ?? '';
    const params = new URLSearchParams({
      encryption: 'none',
      flow: 'xtls-rprx-vision',
      security: 'reality',
      sni,
      fp: REALITY_CLIENT_DEFAULTS.fp,
      pbk,
      sid,
      type: 'tcp'
    });
    return `vless://${userUuid}@${node.serverHost}:${node.serverPort}?${params.toString()}#${encodeURIComponent(node.name)}`;
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
