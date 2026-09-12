import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hashAuthValue, normalizeEmail } from '../common/auth-security';
import { PrismaService } from '../prisma/prisma.service';

export type PlanPurchaseSource = 'SELF_BUY' | 'SELF_UPGRADE' | 'REGISTRATION' | 'ADMIN' | 'MIGRATED';

type DbClient = Prisma.TransactionClient | PrismaService;

type PurchaseIdentityUser = {
  id: string;
  email: string;
  planPurchaseIdentityId: string | null;
};

type PlanLimit = {
  id: string;
  purchaseLimitPerUser: number | null;
};

export type PlanClaimSummary = {
  planId: string;
  used: number;
};

@Injectable()
export class PlanPurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  async listClaimsForUser(userId: string, client: DbClient = this.prisma): Promise<PlanClaimSummary[]> {
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, planPurchaseIdentityId: true }
    });
    if (!user) return [];
    const identityId = user.planPurchaseIdentityId ?? await this.findIdentityIdByEmail(user.email, client);
    if (!identityId) return [];
    const rows = await client.planPurchase.groupBy({
      by: ['planId'],
      where: { identityId },
      _count: { _all: true }
    });
    return rows.map((row) => ({ planId: row.planId, used: row._count._all }));
  }

  async claim(
    userId: string,
    plan: PlanLimit,
    source: PlanPurchaseSource,
    subscriptionId: string | null,
    client: DbClient = this.prisma,
    options: { allowExceedLimit?: boolean } = {}
  ): Promise<string> {
    const identityId = await this.ensureIdentityForUser(userId, client);
    const used = await client.planPurchase.count({ where: { identityId, planId: plan.id } });
    if (!options.allowExceedLimit && plan.purchaseLimitPerUser !== null && used >= plan.purchaseLimitPerUser) {
      throw new ConflictException(
        plan.purchaseLimitPerUser === 1
          ? '该套餐每位用户仅可购买一次，当前账号已使用过'
          : `该套餐每位用户限购 ${plan.purchaseLimitPerUser} 次，当前账号已购买 ${used} 次`
      );
    }

    try {
      const purchase = await client.planPurchase.create({
        data: {
          identityId,
          planId: plan.id,
          sequence: used + 1,
          source,
          subscriptionId
        }
      });
      return purchase.id;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('套餐购买请求已处理，请勿重复提交');
      }
      throw error;
    }
  }

  async ensureIdentityForUser(userId: string, client: DbClient = this.prisma): Promise<string> {
    const user = await this.getIdentityUser(userId, client);
    if (!user) throw new ConflictException('用户不存在，无法记录套餐购买');

    const emailHash = this.hashEmail(user.email);
    const alias = await client.planPurchaseEmailAlias.findUnique({
      where: { emailHash },
      select: { identityId: true }
    });

    if (user.planPurchaseIdentityId) {
      if (alias && alias.identityId !== user.planPurchaseIdentityId) {
        throw new ConflictException('该邮箱存在其他账号的历史套餐记录，无法合并购买身份');
      }
      if (!alias) await this.createAlias(user.planPurchaseIdentityId, emailHash, client);
      return user.planPurchaseIdentityId;
    }

    if (alias) {
      await client.user.update({
        where: { id: userId },
        data: { planPurchaseIdentityId: alias.identityId }
      });
      return alias.identityId;
    }

    const identity = await client.planPurchaseIdentity.create({ data: {} });
    await client.user.update({
      where: { id: userId },
      data: { planPurchaseIdentityId: identity.id }
    });
    await this.createAlias(identity.id, emailHash, client);
    return identity.id;
  }

  async prepareEmailChange(userId: string, newEmail: string, client: DbClient): Promise<void> {
    const identityId = await this.ensureIdentityForUser(userId, client);
    const emailHash = this.hashEmail(newEmail);
    const existing = await client.planPurchaseEmailAlias.findUnique({
      where: { emailHash },
      select: { identityId: true }
    });
    if (existing && existing.identityId !== identityId) {
      throw new ConflictException('该邮箱存在历史套餐记录，无法绑定到当前账号');
    }
    if (!existing) await this.createAlias(identityId, emailHash, client);
  }

  async ensureAliasForDeletion(userId: string, client: DbClient): Promise<void> {
    await this.ensureIdentityForUser(userId, client);
  }

  private async getIdentityUser(userId: string, client: DbClient): Promise<PurchaseIdentityUser | null> {
    return client.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, planPurchaseIdentityId: true }
    });
  }

  private async findIdentityIdByEmail(email: string, client: DbClient): Promise<string | null> {
    const alias = await client.planPurchaseEmailAlias.findUnique({
      where: { emailHash: this.hashEmail(email) },
      select: { identityId: true }
    });
    return alias?.identityId ?? null;
  }

  private async createAlias(identityId: string, emailHash: string, client: DbClient): Promise<void> {
    try {
      await client.planPurchaseEmailAlias.create({ data: { identityId, emailHash } });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const alias = await client.planPurchaseEmailAlias.findUnique({
        where: { emailHash },
        select: { identityId: true }
      });
      if (!alias || alias.identityId !== identityId) {
        throw new ConflictException('该邮箱存在其他账号的历史套餐记录，无法合并购买身份');
      }
    }
  }

  private hashEmail(email: string): string {
    return hashAuthValue('plan-purchase-email', normalizeEmail(email));
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2002';
}
