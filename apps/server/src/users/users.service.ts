import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { AgentGatewayService } from '../agent-gateway/agent-gateway.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../system/settings.service';
import { isUserEntitled } from '../common/utils';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users.query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { LinesService } from '../lines/lines.service';

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
  subscriptionToken: string;
  plan?: {
    id: string;
    name: string;
    lineMatchMode: string;
    lineTagsJson: string;
    lineIdsJson: string;
  } | null;
};

type UserPlanSnapshot = {
  id: string;
  name: string;
  durationDays: number;
  trafficLimitBytes: bigint;
  isPublic: boolean;
};

// 管理端用户视图字段（不含 passwordHash / uuid 等敏感字段）
const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  role: true,
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
      plan: { select: { id: true, name: true } }
    }
  }
} as const;

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private settingsService: SettingsService,
    private agentGateway: AgentGatewayService,
    @Optional() private linesService?: LinesService
  ) {}

  // 重置订阅令牌：旧链接立即失效，返回新 token
  async resetSubscriptionToken(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException();
    }
    const subscriptionToken = randomUUID();
    const subscriptionDelegate = (this.prisma as unknown as { subscription?: UserSubscriptionDelegate }).subscription;
    const subscription = subscriptionDelegate
      ? await subscriptionDelegate.findUnique({ where: { userId } })
      : null;
    if (subscription) {
      await this.prisma.$transaction(async (tx) => {
        await tx.subscription.update({ where: { id: subscription.id }, data: { subscriptionToken } });
        await tx.user.update({ where: { id: userId }, data: { subscriptionToken } });
      });
    } else {
      await this.prisma.user.update({ where: { id: userId }, data: { subscriptionToken } });
    }
    return subscriptionToken;
  }

  // ---------- 管理员接口 ----------

  // 分页列表：邮箱、角色、账号状态、订阅状态与套餐均由数据库过滤
  async listUsers(query: ListUsersQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const subscriptionWhere = query.subscriptionStatus || query.planId
      ? {
          is: {
            ...(query.subscriptionStatus ? { status: query.subscriptionStatus } : {}),
            ...(query.planId ? { planId: query.planId } : {})
          }
        }
      : undefined;
    const where = {
      ...(query.search ? { email: { contains: query.search } } : {}),
      ...(query.role ? { role: query.role } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(subscriptionWhere ? { subscription: subscriptionWhere } : {})
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
    // BigInt 在服务边界转 Number（< 2^53 无精度损失）
    const data = users.map((u) => ({
      ...u,
      trafficLimitBytes: Number(u.trafficLimitBytes),
      trafficUsedBytes: Number(u.trafficUsedBytes),
      subscription: u.subscription
        ? {
            ...u.subscription,
            trafficLimitBytes: Number(u.subscription.trafficLimitBytes),
            trafficUsedBytes: Number(u.subscription.trafficUsedBytes),
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
    const defaultQuota = await this.settingsService.getDefaultQuota();
    const now = new Date();
    const trafficLimitBytes = BigInt(dto.trafficLimitBytes ?? plan?.trafficLimitBytes ?? defaultQuota);
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
              subscriptionToken
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
    const lines = this.linesService
      ? await this.linesService.getAvailableForPlan(subscription?.plan ?? { lineMatchMode: 'ALL', lineTagsJson: '[]', lineIdsJson: '[]' })
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
    const lines = this.linesService
      ? await this.linesService.getAvailableForPlan(subscription?.plan ?? { lineMatchMode: 'ALL', lineTagsJson: '[]', lineIdsJson: '[]' })
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
}
