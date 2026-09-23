import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { PlanPurchasesService } from '../subscription/plan-purchases.service';
import { captureRedeemedPlanSnapshot, type RedeemedPlanSnapshot } from '../subscription/plan-snapshot';
import { BatchRedeemCodesDto } from './dto/batch-redeem-codes.dto';
import { QueryRedeemCodesDto } from './dto/query-redeem-codes.dto';
import { CreateRedeemCodeCategoryDto, UpdateRedeemCodeCategoryDto } from './dto/redeem-code-category.dto';
type CategoryInput = { name: string; tags?: string[]; rewardType?: 'BALANCE' | 'PLAN'; rewardAmount?: number | null; planId?: string | null; limitPerIdentity?: number | null; isActive?: boolean };

export const REDEEM_CODE_EXPORT_LIMIT = 10000;
type RewardSnapshot = { type: 'BALANCE'; amount: number } | { type: 'PLAN'; planId: string; planSnapshot: RedeemedPlanSnapshot };
type RedeemCodeRow = {
  id: string; code: string; amount: number; rewardType: string; rewardSnapshotJson: string | null; planId: string | null; categoryId: string | null;
  status: string; expiresAt: Date | null; note: string | null; redeemedAt: Date | null; redeemedByUserId: string | null;
  deletedAt?: Date | null; deletedByUserId?: string | null; createdAt: Date; updatedAt: Date;
  category?: { id: string; name: string; tagsJson?: string } | null;
  redeemedBy?: { id: string; email: string; nickname: string | null } | null;
};

@Injectable()
export class RedeemCodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly subscriptions: SubscriptionService,
    private readonly planPurchases: PlanPurchasesService,
    @Optional() private readonly systemLogsService?: SystemLogsService
  ) {}

  async listCategories() {
    const rows = await this.prisma.redeemCodeCategory.findMany({ include: { plan: { select: { id: true, name: true } }, _count: { select: { redeemCodes: true } } }, orderBy: { createdAt: 'asc' } });
    return rows.map(({ tagsJson, ...row }) => ({ ...row, tags: parseJsonArray(tagsJson), plan: row.plan, codeCount: row._count.redeemCodes }));
  }

  async createCategory(dto: CreateRedeemCodeCategoryDto, operatorId?: string) {
    const data = await this.categoryData(dto);
    const row = await this.prisma.redeemCodeCategory.create({ data });
    this.audit('redeem code category created', { categoryId: row.id, rewardType: row.rewardType }, operatorId);
    return this.categoryView(row);
  }

  async updateCategory(id: string, dto: UpdateRedeemCodeCategoryDto, operatorId?: string) {
    const current = await this.prisma.redeemCodeCategory.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('卡密分类不存在');
    const data = await this.categoryData({ name: dto.name ?? current.name, rewardType: dto.rewardType ?? current.rewardType as 'BALANCE' | 'PLAN', rewardAmount: dto.rewardAmount ?? current.rewardAmount, planId: dto.planId !== undefined ? dto.planId : current.planId, limitPerIdentity: dto.limitPerIdentity !== undefined ? dto.limitPerIdentity : current.limitPerIdentity, isActive: dto.isActive, tags: dto.tags ?? parseJsonArray(current.tagsJson) }, true);
    const updated = await this.prisma.redeemCodeCategory.update({ where: { id }, data });
    this.audit('redeem code category updated', { categoryId: id, isActive: updated.isActive }, operatorId);
    return this.categoryView(updated);
  }

  async list(query: QueryRedeemCodesDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const now = new Date();
    const where = this.buildWhere(query, now);
    const [data, total] = await Promise.all([
      this.prisma.redeemCode.findMany({ where, include: { redeemedBy: { select: { id: true, email: true, nickname: true } }, category: { select: { id: true, name: true, tagsJson: true } } }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.redeemCode.count({ where })
    ]);
    return { data: data.map((item) => this.toView(item, now)), total, page, pageSize };
  }

  async stats(categoryId?: string, deletedOnly = false) {
    const now = new Date();
    const where = { ...(deletedOnly ? { deletedAt: { not: null } } : { deletedAt: null }), ...(categoryId ? { categoryId } : {}) };
    const groups = await this.prisma.redeemCode.groupBy({ by: ['status'], where, _count: { _all: true }, _sum: { amount: true } });
    const expired = await this.prisma.redeemCode.aggregate({ where: { ...where, status: 'UNUSED', expiresAt: { not: null, lt: now } }, _count: { _all: true }, _sum: { amount: true } });
    const groupOf = (status: string) => groups.find((group) => group.status === status);
    const expiredCount = expired._count._all;
    const expiredAmount = expired._sum.amount ?? 0;
    const unused = groupOf('UNUSED');
    const byStatus = {
      UNUSED: { count: (unused?._count._all ?? 0) - expiredCount, amount: (unused?._sum.amount ?? 0) - expiredAmount },
      REDEEMED: { count: groupOf('REDEEMED')?._count._all ?? 0, amount: groupOf('REDEEMED')?._sum.amount ?? 0 },
      REVOKED: { count: groupOf('REVOKED')?._count._all ?? 0, amount: groupOf('REVOKED')?._sum.amount ?? 0 },
      EXPIRED: { count: expiredCount, amount: expiredAmount }
    };
    const total = Object.values(byStatus).reduce((sum, item) => sum + item.count, 0);
    const totalAmount = Object.values(byStatus).reduce((sum, item) => sum + item.amount, 0);
    return { total, totalAmount, byStatus };
  }

  async export(query: QueryRedeemCodesDto, format: 'csv' | 'txt') {
    const now = new Date();
    const items = await this.prisma.redeemCode.findMany({ where: this.buildWhere(query, now), include: { redeemedBy: { select: { id: true, email: true, nickname: true } }, category: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, take: REDEEM_CODE_EXPORT_LIMIT });
    if (format === 'txt') return items.map((item) => item.code).join('\n');
    const headers = ['id', 'code', 'rewardType', 'amount', 'category', 'status', 'expiresAt', 'note', 'redeemedAt', 'redeemedBy', 'createdAt'];
    const rows = items.map((item) => {
      const view = this.toView(item, now);
      return [item.id, item.code, item.rewardType, String(item.amount), item.category?.name ?? '', view.status, item.expiresAt?.toISOString() ?? '', item.note ?? '', item.redeemedAt?.toISOString() ?? '', item.redeemedBy?.email ?? '', item.createdAt.toISOString()];
    });
    return [headers.join(','), ...rows.map((row) => row.map(csvCell).join(','))].join('\n');
  }

  async batchCreate(dto: BatchRedeemCodesDto, operatorId?: string | null) {
    const isLegacyRequest = !dto.categoryId;
    const category = dto.categoryId
      ? await this.prisma.redeemCodeCategory.findUnique({ where: { id: dto.categoryId } })
      : await this.prisma.redeemCodeCategory.findUnique({ where: { id: 'legacy-redeem-code-category' } });
    if (!category) throw new NotFoundException('卡密分类不存在');
    if (!category.isActive && !isLegacyRequest) throw new ConflictException('该卡密分类已停用，不能生成新卡');
    const rewardSnapshot = isLegacyRequest
      ? (dto.amount && dto.amount > 0 ? { type: 'BALANCE' as const, amount: dto.amount } : null)
      : await this.rewardSnapshot(category);
    if (!rewardSnapshot) throw new BadRequestException('兼容旧接口生成卡密时必须提供正整数金额');
    if (!isLegacyRequest && rewardSnapshot.type === 'BALANCE' && dto.amount !== undefined && dto.amount !== rewardSnapshot.amount) {
      throw new BadRequestException('卡密金额由分类奖励配置决定');
    }
    const amount = rewardSnapshot.type === 'BALANCE' ? rewardSnapshot.amount : 0;
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    const codes = await this.generateUniqueCodes(dto.count, dto.prefix);
    const createdRows = await this.prisma.$transaction(async (tx) => {
      await tx.redeemCode.createMany({ data: codes.map((code) => ({ code, amount, categoryId: category.id, rewardType: rewardSnapshot.type, rewardSnapshotJson: JSON.stringify(rewardSnapshot), planId: rewardSnapshot.type === 'PLAN' ? rewardSnapshot.planId : null, expiresAt, note: dto.note?.trim() || null })) });
      return tx.redeemCode.findMany({ where: { code: { in: codes } }, include: { category: { select: { id: true, name: true } } } });
    });
    const byCode = new Map(createdRows.map((row) => [row.code, row]));
    const created = codes.map((code) => byCode.get(code)!);
    this.audit('redeem codes batch created', { count: created.length, categoryId: category.id, rewardType: rewardSnapshot.type, prefix: dto.prefix ?? null, expiresAt: expiresAt?.toISOString() ?? null }, operatorId);
    return { data: created.map((item) => this.toView(item, new Date())), codes: created.map((item) => item.code), total: created.length };
  }

  async redeem(userId: string, codeInput: string) {
    this.walletService.assertRedeemRateLimit(userId);
    const code = codeInput.trim().toUpperCase();
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const redeemCode = await tx.redeemCode.findUnique({ where: { code }, include: { category: true } });
      if (!redeemCode) throw new NotFoundException('卡密不存在');
      if (redeemCode.status !== 'UNUSED') throw new ConflictException('卡密已使用或已作废');
      if (redeemCode.expiresAt && redeemCode.expiresAt <= now) throw new ConflictException('卡密已过期');
      if (!redeemCode.categoryId || !redeemCode.category) throw new ConflictException('卡密分类数据异常');
      const reward = parseReward(redeemCode.rewardSnapshotJson, redeemCode.rewardType, redeemCode.amount, redeemCode.planId);
      const claimed = await tx.redeemCode.updateMany({ where: { id: redeemCode.id, status: 'UNUSED', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, data: { status: 'REDEEMED', redeemedAt: now, redeemedByUserId: userId } });
      if (claimed.count !== 1) throw new ConflictException('卡密已使用或已作废');
      const identityId = await this.planPurchases.ensureIdentityForUser(userId, tx);
      const limitPerIdentity = redeemCode.category.limitPerIdentity;
      const inserted = await tx.$queryRaw<Array<{ usedCount: number }>>(Prisma.sql`
        INSERT INTO "RedeemCodeCategoryUsage" ("identityId", "categoryId", "usedCount", "updatedAt")
        VALUES (${identityId}, ${redeemCode.categoryId}, 1, CURRENT_TIMESTAMP)
        ON CONFLICT("identityId", "categoryId") DO UPDATE SET
          "usedCount" = "RedeemCodeCategoryUsage"."usedCount" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE ${limitPerIdentity} IS NULL
          OR "RedeemCodeCategoryUsage"."usedCount" < ${limitPerIdentity}
        RETURNING "usedCount"
      `);
      if (!inserted.length) throw new ConflictException('该购买身份已达到此分类的卡密兑换上限');
      if (reward.type === 'BALANCE') {
        const fulfillment = await this.walletService.applyBalanceChange(tx, userId, reward.amount, 'REDEEM', '卡密充值', redeemCode.id, redeemCode.id);
        return { code: redeemCode.code, rewardType: reward.type, amount: reward.amount, ...fulfillment };
      }
      const subscription = await this.subscriptions.activateRedeemedPlan(userId, reward.planSnapshot, tx);
      return { code: redeemCode.code, rewardType: reward.type, plan: subscription };
    }, { timeout: 20000 });
    if (result.rewardType === 'PLAN') this.subscriptions.notifyFulfillmentCompleted();
    return result;
  }

  async revoke(id: string, operatorId?: string | null) {
    const result = await this.prisma.redeemCode.updateMany({ where: { id, status: 'UNUSED' }, data: { status: 'REVOKED' } });
    if (result.count !== 1) {
      const existing = await this.prisma.redeemCode.findUnique({ where: { id }, select: { id: true } });
      if (!existing) throw new NotFoundException('卡密不存在');
      throw new ConflictException('仅未使用卡密可以作废');
    }
    this.audit('redeem code revoked', { id }, operatorId);
    return { revoked: true, id };
  }

  async batchRevoke(ids: string[], operatorId?: string | null) {
    const result = await this.prisma.redeemCode.updateMany({ where: { id: { in: ids }, status: 'UNUSED' }, data: { status: 'REVOKED' } });
    this.audit('redeem codes batch revoked', { requested: ids.length, revoked: result.count }, operatorId);
    return { requested: ids.length, revoked: result.count, skipped: ids.length - result.count };
  }

  async softDelete(ids: string[], operatorId?: string | null) {
    const now = new Date();
    const result = await this.prisma.redeemCode.updateMany({ where: { id: { in: ids }, deletedAt: null }, data: { deletedAt: now, deletedByUserId: operatorId ?? null } });
    this.audit('redeem codes soft deleted', { requested: ids.length, deleted: result.count }, operatorId);
    return { requested: ids.length, deleted: result.count, skipped: ids.length - result.count };
  }

  async restore(id: string, operatorId?: string | null) {
    const result = await this.prisma.redeemCode.updateMany({ where: { id, deletedAt: { not: null } }, data: { deletedAt: null, deletedByUserId: null } });
    if (!result.count) throw new NotFoundException('已删除卡密不存在');
    this.audit('redeem code restored', { id }, operatorId);
    return { restored: true, id };
  }

  async cleanup(retentionDays: number, operatorId?: string | null) {
    const cutoff = new Date(Date.now() - retentionDays * 86400000);
    const result = await this.prisma.redeemCode.updateMany({ where: { status: 'UNUSED', expiresAt: { not: null, lt: cutoff }, deletedAt: null }, data: { deletedAt: new Date(), deletedByUserId: operatorId ?? null } });
    this.audit('expired redeem codes soft deleted', { deleted: result.count, retentionDays }, operatorId);
    return { deleted: result.count, retentionDays };
  }

  private buildWhere(query: QueryRedeemCodesDto, now: Date) {
    return {
      ...(query.deletedOnly ? { deletedAt: { not: null } } : { deletedAt: null }),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.search ? { code: { contains: query.search } } : {}),
      ...(query.status === 'EXPIRED' ? { status: 'UNUSED', expiresAt: { not: null, lt: now } } : query.status ? { status: query.status } : {})
    };
  }

  private async categoryData(dto: CategoryInput, partial = false) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('卡密分类名称不能为空');
    const tags = [...new Set((dto.tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
    if (tags.some((tag) => tag.length > 40) || tags.length > 20) throw new BadRequestException('分类标签最多 20 个，每个不超过 40 个字符');
    const planId: string | null = dto.rewardType === 'PLAN' ? dto.planId ?? null : null;
    const rewardAmount: number | null = dto.rewardType === 'BALANCE' ? dto.rewardAmount ?? null : null;
    if (dto.rewardType === 'BALANCE' && (!rewardAmount || rewardAmount <= 0)) throw new BadRequestException('余额奖励必须配置正整数金额（分）');
    if (dto.rewardType === 'PLAN') {
      if (!planId) throw new BadRequestException('套餐奖励必须选择套餐');
      await this.getPlan(planId);
    }
    return {
      name,
      ...(dto.tags !== undefined || !partial ? { tagsJson: JSON.stringify(tags) } : {}),
      ...(dto.rewardType !== undefined || !partial ? { rewardType: dto.rewardType } : {}),
      ...(dto.rewardAmount !== undefined || !partial ? { rewardAmount } : {}),
      ...(dto.planId !== undefined || dto.rewardType !== undefined || !partial ? { planId } : {}),
      ...(dto.limitPerIdentity !== undefined || !partial ? { limitPerIdentity: dto.limitPerIdentity === null ? null : dto.limitPerIdentity ?? 1 } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {})
    };
  }

  private async rewardSnapshot(category: { rewardType: string; rewardAmount: number | null; planId: string | null }): Promise<RewardSnapshot> {
    if (category.rewardType === 'BALANCE') {
      if (!category.rewardAmount || category.rewardAmount <= 0) throw new ConflictException('分类余额奖励配置无效');
      return { type: 'BALANCE', amount: category.rewardAmount };
    }
    if (category.rewardType !== 'PLAN' || !category.planId) throw new ConflictException('分类奖励配置无效');
    const plan = await this.getPlan(category.planId);
    return { type: 'PLAN', planId: plan.id, planSnapshot: captureRedeemedPlanSnapshot(plan) };
  }

  private async getPlan(planId: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId }, include: { template: true } });
    if (!plan) throw new NotFoundException('套餐不存在');
    return plan;
  }

  private categoryView(category: { id: string; name: string; tagsJson: string; rewardType: string; rewardAmount: number | null; planId: string | null; limitPerIdentity: number | null; isActive: boolean; createdAt: Date; updatedAt: Date }) {
    return { ...category, tags: parseJsonArray(category.tagsJson) };
  }

  private async generateUniqueCodes(count: number, prefix?: string) {
    const codes = new Set<string>();
    for (let round = 0; round < 5 && codes.size < count; round += 1) {
      while (codes.size < count) codes.add(this.walletService.generateCode(prefix));
      const conflicts = await this.prisma.redeemCode.findMany({ where: { code: { in: [...codes] } }, select: { code: true } });
      for (const row of conflicts) codes.delete(row.code);
    }
    if (codes.size < count) throw new ConflictException('卡密生成失败，请重试');
    return [...codes];
  }

  private toView(item: RedeemCodeRow, now: Date) {
    const status = item.status === 'UNUSED' && item.expiresAt && item.expiresAt <= now ? 'EXPIRED' : item.status;
    const reward = parseReward(item.rewardSnapshotJson, item.rewardType, item.amount, item.planId);
    return {
      id: item.id, code: item.code, amount: item.amount, rewardType: item.rewardType, reward,
      status, expiresAt: item.expiresAt, note: item.note, categoryId: item.categoryId,
      category: item.category ? { id: item.category.id, name: item.category.name, tags: parseJsonArray(item.category.tagsJson ?? '[]') } : null,
      deletedAt: item.deletedAt ?? null, redeemedAt: item.redeemedAt, redeemedByUserId: item.redeemedByUserId,
      redeemedBy: item.redeemedBy ?? null, createdAt: item.createdAt, updatedAt: item.updatedAt
    };
  }

  private audit(message: string, metadata: Record<string, unknown>, operatorId?: string | null): void {
    try {
      this.systemLogsService?.enqueue({ source: 'SERVER', level: 'INFO', module: 'REDEEM_CODE', message, metadata, userId: operatorId ?? null });
    } catch {
      // 审计日志故障不得阻断卡密管理主流程。
    }
  }
}

function parseReward(json: string | null, type: string, amount: number, planId: string | null): RewardSnapshot {
  try {
    const value = json ? JSON.parse(json) as RewardSnapshot : null;
    if (value?.type === 'BALANCE' && Number.isInteger(value.amount)) return value;
    if (value?.type === 'PLAN' && value.planSnapshot) return value;
  } catch { /* use migration-compatible fallback */ }
  if (type === 'PLAN' && planId) throw new ConflictException('套餐卡奖励快照缺失');
  return { type: 'BALANCE', amount };
}

function parseJsonArray(value: string): string[] {
  try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []; }
  catch { return []; }
}

function csvCell(value: string) { return `"${value.replace(/"/g, '""')}"`; }
