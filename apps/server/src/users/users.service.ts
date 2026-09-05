import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { AgentService } from '../agent-gateway/agent.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../system/settings.service';
import { isUserEntitled } from '../common/utils';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users.query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { LinesService } from '../lines/lines.service';
import { WalletService } from '../wallet/wallet.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { getTrafficPeriod } from '../common/traffic-reset';

type UserSubscriptionDelegate = {
  findUnique: (args: Record<string, unknown>) => Promise<UserSubscriptionSnapshot | null>;
};

type UserPlanDelegate = {
  findUnique: (args: Record<string, unknown>) => Promise<UserPlanSnapshot | null>;
  findFirst: (args: Record<string, unknown>) => Promise<UserPlanSnapshot | null>;
};

type UserSubscriptionSnapshot = {
  id: string;
  status: string;
  trafficLimitBytes: bigint;
  trafficUsedBytes: bigint;
  startedAt: Date;
  expireAt: Date | null;
  trafficPeriodStartAt: Date | null;
  subscriptionToken: string;
  plan?: {
    id: string;
    name: string;
    lineMatchMode: string;
    lineTagsJson: string;
    lineIdsJson: string;
    durationDays: number;
    trafficResetMode: string;
  } | null;
};

type UserPlanSnapshot = {
  id: string;
  name: string;
  durationDays: number;
  trafficLimitBytes: bigint;
  isPublic: boolean;
  trafficResetMode: string;
};

// 管理端用户视图字段（不含 passwordHash / uuid 等敏感字段）
const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  role: true,
  balance: true,
  trafficLimitBytes: true,
  trafficUsedBytes: true,
  expireAt: true,
  isActive: true,
  createdAt: true,
  subscription: {
    select: {
      id: true,
      status: true,
      trafficLimitBytes: true,
      trafficUsedBytes: true,
      startedAt: true,
      expireAt: true,
      trafficPeriodStartAt: true,
      plan: { select: { id: true, name: true, durationDays: true, trafficResetMode: true } }
    }
  },
  extraLineGrants: { select: { lineId: true } }
} as const;

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private settingsService: SettingsService,
    private agentGateway: AgentService,
    @Optional() private linesService?: LinesService,
    @Optional() private walletService?: WalletService
  ) {}

  // 重置订阅令牌：旧链接立即失效，返回新 token
  async resetSubscriptionToken(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException();
    }
    const subscriptionDelegate = (this.prisma as unknown as { subscription?: UserSubscriptionDelegate }).subscription;
    const subscription = subscriptionDelegate
      ? await subscriptionDelegate.findUnique({ where: { userId } })
      : null;
    if (!subscription) {
      throw new BadRequestException('该用户未绑定有效订阅，无法重置订阅链接');
    }
    const subscriptionToken = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({ where: { id: subscription.id }, data: { subscriptionToken } });
      await tx.user.update({ where: { id: userId }, data: { subscriptionToken } });
    });
    return subscriptionToken;
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user || !(await bcrypt.compare(dto.oldPassword, user.passwordHash))) {
      throw new UnauthorizedException('旧密码错误');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(dto.newPassword, 10) } });
    return { updated: true };
  }

  async resetUuid(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new UnauthorizedException();
    const uuid = randomUUID();
    await this.prisma.user.update({ where: { id: userId }, data: { uuid } });
    void this.agentGateway.pushConfigToAll();
    return { uuid };
  }

  async adjustBalance(userId: string, amount: number, description?: string) {
    if (!this.walletService) throw new BadRequestException('钱包服务不可用');
    const result = await this.walletService.adjustBalance(userId, amount, 'ADMIN_ADJUST', description ?? '管理员调账');
    return { userId, ...result };
  }

  // ---------- 管理员接口 ----------

  // 分页列表：邮箱、角色、账号状态、订阅状态与套餐均由数据库过滤
  async listUsers(query: ListUsersQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    let subscriptionWhere: Record<string, unknown> | null | undefined = undefined;

    const wantNoSubscription = query.subscriptionStatus === 'NONE';
    const wantNoPlan = query.planId === 'NONE';

    if (wantNoSubscription || wantNoPlan) {
      if ((query.subscriptionStatus && !wantNoSubscription) || (query.planId && !wantNoPlan)) {
        subscriptionWhere = { is: { status: 'NONE' } };
      } else {
        subscriptionWhere = null;
      }
    } else if (query.subscriptionStatus || query.planId) {
      subscriptionWhere = {
        is: {
          ...(query.subscriptionStatus ? { status: query.subscriptionStatus } : {}),
          ...(query.planId ? { planId: query.planId } : {})
        }
      };
    }

    const where = {
      ...(query.search ? { email: { contains: query.search } } : {}),
      ...(query.role ? { role: query.role } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(subscriptionWhere !== undefined ? { subscription: subscriptionWhere } : {})
    };
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: ADMIN_USER_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.user.count({ where })
    ]);
    const timeZone = (await this.settingsService.getSettings())?.systemTimezone ?? 'Asia/Shanghai';
    // BigInt 在服务边界转 Number（< 2^53 无精度损失）
    const data = users.map(({ extraLineGrants, ...u }) => ({
      ...u,
      trafficLimitBytes: Number(u.trafficLimitBytes),
      trafficUsedBytes: Number(u.trafficUsedBytes),
      subscription: u.subscription
        ? {
            ...u.subscription,
            trafficLimitBytes: Number(u.subscription.trafficLimitBytes),
            trafficUsedBytes: Number(u.subscription.trafficUsedBytes),
            trafficResetMode: u.subscription.plan?.trafficResetMode ?? 'NONE',
            nextTrafficResetAt: u.subscription.plan
              ? getTrafficPeriod(
                  u.subscription.plan.trafficResetMode,
                  new Date(),
                  u.subscription.startedAt,
                  u.subscription.plan.durationDays,
                  timeZone
                )?.nextResetAt ?? null
              : null,
            extraLineIds: (extraLineGrants ?? []).map((grant) => grant.lineId),
            plan: u.subscription.plan
          }
        : null
    }));
    return { data, total, page, pageSize };
  }

  async createUser(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('邮箱已存在');
    }
    const plan = await this.resolveInitialPlan(dto.planId);
    const timeZone = (await this.settingsService.getSettings())?.systemTimezone ?? 'Asia/Shanghai';
    const now = new Date();
    const trafficLimitBytes = BigInt(dto.trafficLimitBytes ?? plan?.trafficLimitBytes ?? 0);
    const expireAt = dto.expireAt !== undefined
      ? dto.expireAt
        ? new Date(dto.expireAt)
        : null
      : plan
        ? new Date(now.getTime() + plan.durationDays * 86400000)
        : null;
    const subscriptionToken = randomUUID();
    const data = {
      email: dto.email,
      passwordHash: await bcrypt.hash(dto.password, 10),
      role: dto.role ?? 'USER',
      trafficLimitBytes,
      expireAt,
      subscriptionToken
    };
    const user = plan
      ? await this.prisma.$transaction(async (tx) => {
          const created = await tx.user.create({ data, select: ADMIN_USER_SELECT });
          await tx.subscription.create({
            data: {
              userId: created.id,
              planId: plan.id,
              status: 'ACTIVE',
              trafficLimitBytes,
              trafficUsedBytes: BigInt(0),
              startedAt: now,
              expireAt,
              subscriptionToken,
              trafficPeriodStartAt: getTrafficPeriod(plan.trafficResetMode, now, now, plan.durationDays, timeZone)?.startAt ?? null
            }
          });
          return created;
        })
      : await this.prisma.user.create({ data, select: ADMIN_USER_SELECT });
    void this.agentGateway.pushConfigToAll();
    return { ...user, trafficLimitBytes: Number(user.trafficLimitBytes), trafficUsedBytes: Number(user.trafficUsedBytes) };
  }

  async updateUser(id: string, dto: UpdateUserDto, operatorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    // 防锁死：管理员不能修改自己的角色
    if (dto.role !== undefined && id === operatorId && dto.role !== user.role) {
      throw new ForbiddenException('不能修改自己的角色');
    }
    const data: Record<string, unknown> = {};
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.trafficLimitBytes !== undefined) data.trafficLimitBytes = BigInt(dto.trafficLimitBytes);
    if (dto.expireAt !== undefined) data.expireAt = dto.expireAt ? new Date(dto.expireAt) : null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.password !== undefined) {
      if (dto.password.length < 8) {
        throw new BadRequestException('密码至少 8 位');
      }
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }
    const updated = await this.prisma.user.update({ where: { id }, data, select: ADMIN_USER_SELECT });
    const subscriptionDelegate = (this.prisma as unknown as { subscription?: UserSubscriptionDelegate }).subscription;
    const subscription = subscriptionDelegate
      ? await subscriptionDelegate.findUnique({ where: { userId: id } })
      : null;
    if (subscription) {
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          ...(dto.trafficLimitBytes !== undefined ? { trafficLimitBytes: BigInt(dto.trafficLimitBytes) } : {}),
          ...(dto.expireAt !== undefined ? { expireAt: dto.expireAt ? new Date(dto.expireAt) : null } : {})
        }
      });
    }
    // 配额/到期/激活/角色变化影响订阅资格，向在线节点同步用户名单
    void this.agentGateway.pushConfigToAll();
    return { ...updated, trafficLimitBytes: Number(updated.trafficLimitBytes), trafficUsedBytes: Number(updated.trafficUsedBytes) };
  }

  async deleteUser(id: string, operatorId: string) {
    if (id === operatorId) {
      throw new ForbiddenException('不能删除自己');
    }
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    // TrafficLog 经 schema onDelete: Cascade 级联删除
    await this.prisma.user.delete({ where: { id } });
    void this.agentGateway.pushConfigToAll();
    return { deleted: true, id };
  }

  async getDashboard(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException();
    }
    const subscriptionDelegate = (this.prisma as unknown as { subscription?: UserSubscriptionDelegate }).subscription;
    const subscription = subscriptionDelegate
      ? await subscriptionDelegate.findUnique({ where: { userId }, include: { plan: true } })
      : null;
    const extraLineIds = await this.getExtraLineIds(userId);
    const lines = this.linesService
      ? await this.linesService.getAvailableForPlan(subscription?.plan ?? { lineMatchMode: 'ALL', lineTagsJson: '[]', lineIdsJson: '[]' }, extraLineIds)
      : [];
    const trafficLimitBytes = subscription?.trafficLimitBytes ?? user.trafficLimitBytes;
    const trafficUsedBytes = subscription?.trafficUsedBytes ?? user.trafficUsedBytes;
    const expireAt = subscription?.expireAt ?? user.expireAt;
    const subscriptionToken = subscription?.subscriptionToken ?? user.subscriptionToken;
    return {
      // BigInt 无法 JSON 序列化，在服务边界转 Number（流量值 < 2^53，无精度损失）
      trafficLimitBytes: Number(trafficLimitBytes),
      trafficUsedBytes: Number(trafficUsedBytes),
      expireAt,
      subscriptionToken,
      plan: subscription?.plan ? { id: subscription.plan.id, name: subscription.plan.name, status: subscription.status } : null,
      onlineNodeCount: lines.length,
      lines
    };
  }

  // 公开节点列表（用户可见视图，不含 agentToken 等敏感字段）
  async getAvailableNodes(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException();
    }
    const subscriptionDelegate = (this.prisma as unknown as { subscription?: UserSubscriptionDelegate }).subscription;
    const subscription = subscriptionDelegate
      ? await subscriptionDelegate.findUnique({ where: { userId }, include: { plan: true } })
      : null;
    const extraLineIds = await this.getExtraLineIds(userId);
    const lines = this.linesService
      ? await this.linesService.getAvailableForPlan(subscription?.plan ?? { lineMatchMode: 'ALL', lineTagsJson: '[]', lineIdsJson: '[]' }, extraLineIds)
      : [];
    return {
      entitled: subscription
        ? user.isActive && ['ACTIVE', 'CANCELED'].includes(subscription.status) && (!subscription.expireAt || subscription.expireAt > new Date()) && subscription.trafficUsedBytes < subscription.trafficLimitBytes
        : isUserEntitled(user),
      lines,
      nodes: lines
    };
  }

  private async resolveInitialPlan(planId?: string | null) {
    const planDelegate = (this.prisma as unknown as { plan?: UserPlanDelegate }).plan;
    if (!planDelegate) return null;
    if (planId === null) return null;
    if (planId) {
      const plan = await planDelegate.findUnique({ where: { id: planId } });
      if (!plan) throw new NotFoundException('套餐不存在');
      return plan;
    }
    return (
      (await planDelegate.findFirst({ where: { name: '体验套餐' } })) ??
      (await planDelegate.findFirst({ where: { isPublic: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }))
    );
  }

  private async getExtraLineIds(userId: string): Promise<string[]> {
    const delegate = (this.prisma as unknown as {
      userLineGrant?: { findMany: (args: Record<string, unknown>) => Promise<Array<{ lineId: string }>> };
    }).userLineGrant;
    if (!delegate) return [];
    const rows = await delegate.findMany({ where: { userId }, select: { lineId: true } });
    return rows.map((row) => row.lineId);
  }
}
