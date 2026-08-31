import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AgentGatewayService } from '../agent-gateway/agent-gateway.service';
import { LinesService } from '../lines/lines.service';
import { isUserEntitled } from '../common/utils';
import type { ProtocolType } from '../common/constants';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildClashYaml,
  buildSingboxJson,
  buildUriList,
  type SubNode,
  type SubLine,
  type SubUser
} from './builders';
import type { AdminUpdateSubDto } from './dto/admin-update-subscription.dto';
import type { QuerySubscriptionDto } from './dto/query-subscription.dto';
import type { Prisma } from '@prisma/client';
import type { SubscriptionTemplateConfig } from './builders';

type SubscriptionPlan = {
  id: string;
  name: string;
  durationDays: number;
  trafficLimitBytes: bigint;
  lineMatchMode: string;
  lineTagsJson: string;
  lineIdsJson: string;
  isPublic?: boolean;
  template?: SubscriptionTemplateConfig | null;
};

type SubscriptionUser = {
  id: string;
  email: string;
  uuid: string;
  password: string | null;
  isActive: boolean;
  expireAt: Date | null;
  trafficLimitBytes: bigint;
  trafficUsedBytes: bigint;
};

type SubscriptionRecord = {
  id: string;
  userId: string;
  planId: string;
  status: string;
  trafficLimitBytes: bigint;
  trafficUsedBytes: bigint;
  startedAt: Date;
  expireAt: Date | null;
  subscriptionToken: string;
  canceledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user?: SubscriptionUser | null;
  plan?: SubscriptionPlan | null;
};

type SubscriptionDelegate = {
  findUnique: (args: Record<string, unknown>) => Promise<SubscriptionRecord | null>;
  findMany: (args: Record<string, unknown>) => Promise<SubscriptionRecord[]>;
  count: (args: Record<string, unknown>) => Promise<number>;
  update: (args: Record<string, unknown>) => Promise<SubscriptionRecord>;
  updateMany: (args: Record<string, unknown>) => Promise<{ count: number }>;
};

export type SubscriptionFormat = 'base64' | 'clash' | 'singbox';

export const SUBSCRIPTION_CONTENT_TYPES: Record<SubscriptionFormat, string> = {
  base64: 'text/plain; charset=utf-8',
  clash: 'text/yaml; charset=utf-8',
  singbox: 'application/json; charset=utf-8'
};

export function resolveFormat(type?: string, userAgent?: string): SubscriptionFormat {
  const t = (type ?? '').trim().toLowerCase();
  if (t === 'clash') return 'clash';
  if (t === 'sing-box' || t === 'singbox') return 'singbox';
  const ua = userAgent ?? '';
  if (/clash|meta|mihomo/i.test(ua)) return 'clash';
  if (/sing-?box/i.test(ua)) return 'singbox';
  return 'base64';
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 86400000);
}

@Injectable()
export class SubscriptionService implements OnModuleInit, OnModuleDestroy {
  private expiryTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly agentGateway?: AgentGatewayService,
    @Optional() private readonly linesService?: LinesService
  ) {}

  onModuleInit() {
    if (this.subscriptionDelegate()) {
      // 用进程内巡检保持零外部依赖；unref 不阻止测试进程自然退出。
      this.expiryTimer = setInterval(() => void this.expireSubscriptions(), 60000);
      this.expiryTimer.unref();
    }
  }

  onModuleDestroy() {
    if (this.expiryTimer) clearInterval(this.expiryTimer);
  }

  async getSubscription(token: string, opts: { type?: string; userAgent?: string } = {}) {
    const subscription = await this.findByToken(token);
    const user = subscription?.user ?? (await this.prisma.user.findUnique({ where: { subscriptionToken: token } }));
    if (!user) throw new NotFoundException('订阅不存在');

    if (subscription ? !this.isSubscriptionEntitled(subscription, user) : !isUserEntitled(user)) {
      throw new ForbiddenException('账号已过期、被禁用或超出流量配额');
    }

    let subscriptionSources: Array<SubLine | SubNode>;
    if (this.linesService) {
      const lines = subscription
        ? await this.linesService.getAvailableForPlan(subscription.plan ?? { lineMatchMode: 'ALL', lineTagsJson: '[]', lineIdsJson: '[]' })
        : await this.linesService.getAvailableForPlan({ lineMatchMode: 'ALL', lineTagsJson: '[]', lineIdsJson: '[]' });
      subscriptionSources = lines.map((line) => ({
          id: line.id,
          name: line.name,
          type: line.type,
          relayMode: line.relayMode,
          endpointOverrideEnabled: line.endpointOverrideEnabled,
          serverHost: line.serverHost,
          serverPort: line.serverPort,
          serverName: line.serverName,
          host: line.host,
          trafficRate: line.trafficRate,
          tags: line.tags,
          level: line.level,
          targetInbound: {
            type: line.targetInbound.type as ProtocolType,
            tag: line.targetInbound.tag,
            port: line.targetInbound.port,
            params: line.targetInbound.params
          }
        }));
    } else {
      const nodes = subscription ? await this.getLegacyNodes() : await this.getLegacyLines();
      subscriptionSources = nodes.map((node) => ({
          name: node.name,
          serverHost: node.serverHost,
          inbounds: node.inbounds.map((inbound) => ({
            type: inbound.type as ProtocolType,
            tag: inbound.tag,
            port: inbound.port,
            params: JSON.parse(inbound.paramsJson) as Record<string, unknown>
          }))
        }));
    }

    const subUser: SubUser = { uuid: user.uuid, email: user.email, credential: user.password ?? user.uuid };
    const format = resolveFormat(opts.type, opts.userAgent);
    const template = await this.resolveTemplate(subscription?.plan?.template);
    return {
      body: this.render(format, subscriptionSources, subUser, template),
      contentType: SUBSCRIPTION_CONTENT_TYPES[format],
      userInfoHeader: this.buildUserInfoHeader(subscription ?? user)
    };
  }

  async subscribe(userId: string, planId: string) {
    this.requireSubscriptionDelegate();
    const plan = await this.prisma.plan.findUnique({ where: { id: planId }, include: { template: true } });
    if (!plan || !plan.isPublic) throw new NotFoundException('套餐不存在或未开放');
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.subscription.findUnique({ where: { userId } });
      if (current && this.isSubscriptionActive(current)) {
        throw new ConflictException('已有有效订阅，请使用升配操作');
      }
      const data = {
        planId: plan.id,
        status: 'ACTIVE',
        trafficLimitBytes: plan.trafficLimitBytes,
        trafficUsedBytes: BigInt(0),
        startedAt: now,
        expireAt: addDays(now, plan.durationDays),
        subscriptionToken: randomUUID(),
        canceledAt: null
      };
      const subscription = current
        ? await tx.subscription.update({ where: { id: current.id }, data })
        : await tx.subscription.create({ data: { ...data, userId } });
      await this.syncUserMirror(tx, userId, subscription);
      return subscription;
    });
    void this.agentGateway?.pushConfigToAll();
    return this.get(result.id);
  }

  async upgrade(userId: string, planId: string) {
    const delegate = this.requireSubscriptionDelegate();
    const plan = await this.prisma.plan.findUnique({ where: { id: planId }, include: { template: true } });
    if (!plan || !plan.isPublic) throw new NotFoundException('套餐不存在或未开放');
    const current = await delegate.findUnique({ where: { userId } });
    if (!current || !this.isSubscriptionActive(current)) throw new ConflictException('当前没有可升配的有效订阅');
    const subscription = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.subscription.update({
        where: { id: current.id },
        data: {
          planId: plan.id,
          trafficLimitBytes: plan.trafficLimitBytes,
          trafficUsedBytes: BigInt(0),
          startedAt: new Date(),
          expireAt: addDays(new Date(), plan.durationDays),
          status: 'ACTIVE',
          canceledAt: null
        }
      });
      await this.syncUserMirror(tx, userId, updated);
      return updated;
    });
    void this.agentGateway?.pushConfigToAll();
    return this.get(subscription.id);
  }

  async cancel(userId: string) {
    const delegate = this.requireSubscriptionDelegate();
    const current = await delegate.findUnique({ where: { userId } });
    if (!current) throw new NotFoundException('订阅不存在');
    const status = current.expireAt && current.expireAt.getTime() <= Date.now() ? 'EXPIRED' : 'CANCELED';
    const subscription = await this.prisma.subscription.update({
      where: { id: current.id },
      data: { status, canceledAt: new Date() }
    });
    void this.agentGateway?.pushConfigToAll();
    return this.get(subscription.id);
  }

  async getForUser(userId: string) {
    const delegate = this.requireSubscriptionDelegate();
    const subscription = await delegate.findUnique({
      where: { userId },
      include: { user: { select: { id: true, email: true, isActive: true } }, plan: { include: { template: true } } }
    });
    if (!subscription) return { subscription: null, lines: [], nodes: [] };
    return {
      subscription: this.toView(subscription),
      lines: await this.getLinesForSubscription(subscription),
      nodes: await this.getLinesForSubscription(subscription)
    };
  }

  async resetToken(userId: string) {
    const delegate = this.requireSubscriptionDelegate();
    const current = await delegate.findUnique({ where: { userId } });
    if (!current) {
      const token = randomUUID();
      await this.prisma.user.update({ where: { id: userId }, data: { subscriptionToken: token } });
      return { subscriptionToken: token };
    }
    return this.resetTokenBySubscription(current.id);
  }

  async resetTokenBySubscription(id: string) {
    const current = await this.getRaw(id);
    const token = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({ where: { id }, data: { subscriptionToken: token } });
      await tx.user.update({ where: { id: current.userId }, data: { subscriptionToken: token } });
    });
    return { subscriptionToken: token };
  }

  async list(query: QuerySubscriptionDto) {
    const delegate = this.requireSubscriptionDelegate();
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.planId ? { planId: query.planId } : {}),
      ...(query.search ? { user: { email: { contains: query.search } } } : {})
    };
    const [data, total] = await Promise.all([
      delegate.findMany({
        where,
        include: { user: { select: { id: true, email: true, isActive: true } }, plan: { select: { id: true, name: true, price: true } } },
        orderBy: [{ updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      delegate.count({ where })
    ]);
    return { data: data.map((item) => this.toView(item)), total, page, pageSize };
  }

  async get(id: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id },
      include: { user: { select: { id: true, email: true, isActive: true } }, plan: { include: { template: true } } }
    });
    if (!subscription) throw new NotFoundException('订阅不存在');
    return this.toView(subscription as unknown as SubscriptionRecord);
  }

  async adminUpdate(id: string, dto: AdminUpdateSubDto) {
    const current = await this.getRaw(id);
    if (dto.planId === null) return this.adminRemove(id, current.userId);
    const plan = dto.planId ? await this.prisma.plan.findUnique({ where: { id: dto.planId } }) : null;
    if (dto.planId && !plan) throw new NotFoundException('套餐不存在');
    const limit = dto.trafficLimitBytes !== undefined ? BigInt(dto.trafficLimitBytes) : plan?.trafficLimitBytes ?? current.trafficLimitBytes;
    const used = dto.trafficUsedBytes !== undefined ? BigInt(dto.trafficUsedBytes) : current.trafficUsedBytes;
    if (used > limit) throw new BadRequestException('已用流量不能大于流量配额');
    const expireAt = dto.expireAt !== undefined
      ? dto.expireAt
        ? new Date(dto.expireAt)
        : null
      : dto.addDays
        ? addDays(current.expireAt && current.expireAt.getTime() > Date.now() ? current.expireAt : new Date(), dto.addDays)
        : current.expireAt;
    const subscription = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.subscription.update({
        where: { id },
        data: {
          ...(dto.planId ? { planId: dto.planId } : {}),
          ...(dto.status ? { status: dto.status } : {}),
          trafficLimitBytes: limit,
          trafficUsedBytes: used,
          expireAt
        }
      });
      await this.syncUserMirror(tx, current.userId, updated);
      return updated;
    });
    void this.agentGateway?.pushConfigToAll();
    return this.get(subscription.id);
  }

  private async adminRemove(id: string, userId: string) {
    const subscriptionToken = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.delete({ where: { id } });
      await tx.user.update({ where: { id: userId }, data: { subscriptionToken } });
    });
    void this.agentGateway?.pushConfigToAll();
    return { removed: true, id, userId };
  }

  async adminAssign(userId: string, dto: AdminUpdateSubDto) {
    if (!dto.planId) throw new BadRequestException('绑定订阅必须指定套餐');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('用户不存在');
    const delegate = this.requireSubscriptionDelegate();
    const current = await delegate.findUnique({ where: { userId } });
    if (current) return this.adminUpdate(current.id, dto);

    const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
    if (!plan) throw new NotFoundException('套餐不存在');
    const now = new Date();
    const limit = dto.trafficLimitBytes !== undefined ? BigInt(dto.trafficLimitBytes) : plan.trafficLimitBytes;
    const used = dto.trafficUsedBytes !== undefined ? BigInt(dto.trafficUsedBytes) : BigInt(0);
    if (used > limit) throw new BadRequestException('已用流量不能大于流量配额');
    const expireAt = dto.expireAt !== undefined
      ? dto.expireAt
        ? new Date(dto.expireAt)
        : null
      : dto.addDays
        ? addDays(now, dto.addDays)
        : addDays(now, plan.durationDays);
    const subscriptionToken = randomUUID();
    const subscription = await this.prisma.$transaction(async (tx) => {
      const created = await tx.subscription.create({
        data: {
          userId,
          planId: plan.id,
          status: dto.status ?? 'ACTIVE',
          trafficLimitBytes: limit,
          trafficUsedBytes: used,
          startedAt: now,
          expireAt,
          subscriptionToken
        }
      });
      await this.syncUserMirror(tx, userId, created);
      return created;
    });
    void this.agentGateway?.pushConfigToAll();
    return this.get(subscription.id);
  }

  private render(format: SubscriptionFormat, lines: Array<SubLine | SubNode>, user: SubUser, template?: SubscriptionTemplateConfig): string {
    switch (format) {
      case 'clash':
        return buildClashYaml(user, lines, template);
      case 'singbox':
        return buildSingboxJson(user, lines, template);
      default:
        return Buffer.from(buildUriList(user, lines).join('\n'), 'utf-8').toString('base64');
    }
  }

  private buildUserInfoHeader(user: {
    trafficLimitBytes: bigint;
    trafficUsedBytes: bigint;
    expireAt: Date | null;
  }): string {
    const expire = user.expireAt ? Math.floor(user.expireAt.getTime() / 1000) : 0;
    return `upload=0; download=${user.trafficUsedBytes}; total=${user.trafficLimitBytes}; expire=${expire}`;
  }

  private isSubscriptionActive(subscription: { status: string; expireAt: Date | null }) {
    return ['ACTIVE', 'CANCELED'].includes(subscription.status) && (!subscription.expireAt || subscription.expireAt.getTime() > Date.now());
  }

  private isSubscriptionEntitled(subscription: SubscriptionRecord, user: SubscriptionUser) {
    return this.isSubscriptionActive(subscription) && user.isActive && subscription.trafficUsedBytes < subscription.trafficLimitBytes;
  }

  private async expireSubscriptions() {
    const delegate = this.subscriptionDelegate();
    if (!delegate) return;
    const result = await delegate.updateMany({
      where: { status: { in: ['ACTIVE', 'CANCELED'] }, expireAt: { not: null, lt: new Date() } },
      data: { status: 'EXPIRED' }
    });
    if (result.count > 0) void this.agentGateway?.pushConfigToAll();
  }

  private async getLinesForSubscription(subscription: SubscriptionRecord) {
    if (this.linesService) {
      return this.linesService.getAvailableForPlan(subscription.plan ?? { lineMatchMode: 'ALL', lineTagsJson: '[]', lineIdsJson: '[]' });
    }
    return this.getLegacyNodes();
  }

  private async getLegacyLines() {
    return this.getLegacyNodes();
  }

  private async getLegacyNodes() {
    const nodeDelegate = (this.prisma as unknown as {
      node: { findMany: (args: Record<string, unknown>) => Promise<Array<{ name: string; serverHost: string; inbounds: Array<{ type: string; tag: string; port: number; paramsJson: string }> }>> };
    }).node;
    return nodeDelegate.findMany({
      where: { isPublic: true, status: { not: 'DISABLED' } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { inbounds: { where: { isPublic: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } }
    });
  }

  private async resolveTemplate(template?: SubscriptionTemplateConfig | null) {
    if (template) return template;
    const templateDelegate = (this.prisma as unknown as {
      subscriptionTemplate?: { findFirst: (args: Record<string, unknown>) => Promise<SubscriptionTemplateConfig | null> };
    }).subscriptionTemplate;
    if (!templateDelegate) return undefined;
    return (await templateDelegate.findFirst({ where: { isDefault: true } })) ?? undefined;
  }

  private subscriptionDelegate(): SubscriptionDelegate | undefined {
    return (this.prisma as unknown as { subscription?: SubscriptionDelegate }).subscription;
  }

  private requireSubscriptionDelegate(): SubscriptionDelegate {
    const delegate = this.subscriptionDelegate();
    if (!delegate) throw new BadRequestException('订阅模块尚未完成数据库迁移');
    return delegate;
  }

  private async findByToken(token: string): Promise<SubscriptionRecord | null> {
    const delegate = this.subscriptionDelegate();
    if (!delegate) return null;
    return delegate.findUnique({
      where: { subscriptionToken: token },
      include: { user: true, plan: { include: { template: true } } }
    });
  }

  private async getRaw(id: string): Promise<SubscriptionRecord> {
    const subscription = await this.prisma.subscription.findUnique({ where: { id } });
    if (!subscription) throw new NotFoundException('订阅不存在');
    return subscription;
  }

  private async syncUserMirror(tx: Prisma.TransactionClient, userId: string, subscription: SubscriptionRecord) {
    await tx.user.update({
      where: { id: userId },
      data: {
        trafficLimitBytes: subscription.trafficLimitBytes,
        trafficUsedBytes: subscription.trafficUsedBytes,
        expireAt: subscription.expireAt,
        subscriptionToken: subscription.subscriptionToken
      }
    });
  }

  private toView(subscription: SubscriptionRecord) {
    return {
      ...subscription,
      trafficLimitBytes: Number(subscription.trafficLimitBytes),
      trafficUsedBytes: Number(subscription.trafficUsedBytes),
      plan: subscription.plan
        ? {
            ...subscription.plan,
            trafficLimitBytes: Number(subscription.plan.trafficLimitBytes)
          }
        : undefined
    };
  }
}
