import { ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BatchRedeemCodesDto } from './dto/batch-redeem-codes.dto';
import { QueryRedeemCodesDto } from './dto/query-redeem-codes.dto';
import { WalletService } from '../wallet/wallet.service';
import { SystemLogsService } from '../system-logs/system-logs.service';

// 导出为管理端一次性拉取动作，设置硬上限防止全表拖垮 SQLite
export const REDEEM_CODE_EXPORT_LIMIT = 10000;

type RedeemCodeRow = {
  id: string;
  code: string;
  amount: number;
  status: string;
  expiresAt: Date | null;
  note: string | null;
  redeemedAt: Date | null;
  redeemedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  redeemedBy?: { id: string; email: string; nickname: string | null } | null;
};

@Injectable()
export class RedeemCodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    // 审计走系统日志通道（module=REDEEM_CODE），Optional 保证单测与无日志模块场景可用
    @Optional() private readonly systemLogsService?: SystemLogsService
  ) {}

  async list(query: QueryRedeemCodesDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const now = new Date();
    const where = this.buildWhere(query, now);
    const [data, total] = await Promise.all([
      this.prisma.redeemCode.findMany({
        where,
        include: { redeemedBy: { select: { id: true, email: true, nickname: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.redeemCode.count({ where })
    ]);
    return { data: data.map((item) => this.toView(item, now)), total, page, pageSize };
  }

  /**
   * 管理端汇总统计：四态互斥（UNUSED 表示未使用且未过期，EXPIRED 为读取时派生状态）
   */
  async stats() {
    const now = new Date();
    const [groups, expired] = await Promise.all([
      this.prisma.redeemCode.groupBy({ by: ['status'], _count: { _all: true }, _sum: { amount: true } }),
      this.prisma.redeemCode.aggregate({
        where: { status: 'UNUSED', expiresAt: { not: null, lt: now } },
        _count: { _all: true },
        _sum: { amount: true }
      })
    ]);
    const groupOf = (status: string) => groups.find((group) => group.status === status);
    const expiredCount = expired._count._all;
    const expiredAmount = expired._sum.amount ?? 0;
    const unusedGroup = groupOf('UNUSED');
    const byStatus = {
      UNUSED: {
        count: (unusedGroup?._count._all ?? 0) - expiredCount,
        amount: (unusedGroup?._sum.amount ?? 0) - expiredAmount
      },
      REDEEMED: { count: groupOf('REDEEMED')?._count._all ?? 0, amount: groupOf('REDEEMED')?._sum.amount ?? 0 },
      REVOKED: { count: groupOf('REVOKED')?._count._all ?? 0, amount: groupOf('REVOKED')?._sum.amount ?? 0 },
      EXPIRED: { count: expiredCount, amount: expiredAmount }
    };
    const total = Object.values(byStatus).reduce((sum, item) => sum + item.count, 0);
    const totalAmount = Object.values(byStatus).reduce((sum, item) => sum + item.amount, 0);
    return { total, totalAmount, byStatus };
  }

  /**
   * 按列表同款筛选导出：csv 含全部审计字段，txt 仅卡密行（用于直接分发）
   */
  async export(query: QueryRedeemCodesDto, format: 'csv' | 'txt') {
    const now = new Date();
    const items = await this.prisma.redeemCode.findMany({
      where: this.buildWhere(query, now),
      include: { redeemedBy: { select: { id: true, email: true, nickname: true } } },
      orderBy: { createdAt: 'desc' },
      take: REDEEM_CODE_EXPORT_LIMIT
    });
    if (format === 'txt') {
      return items.map((item) => item.code).join('\n');
    }
    const headers = ['id', 'code', 'amount', 'status', 'expiresAt', 'note', 'redeemedAt', 'redeemedBy', 'createdAt'];
    const rows = items.map((item) => {
      const view = this.toView(item, now);
      return [
        item.id,
        item.code,
        String(item.amount),
        view.status,
        item.expiresAt?.toISOString() ?? '',
        item.note ?? '',
        item.redeemedAt?.toISOString() ?? '',
        item.redeemedBy?.email ?? '',
        item.createdAt.toISOString()
      ];
    });
    return [headers.join(','), ...rows.map((row) => row.map((cell) => this.csvCell(cell)).join(','))].join('\n');
  }

  async batchCreate(dto: BatchRedeemCodesDto, operatorId?: string | null) {
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    // 生成与碰撞预检在事务外完成，事务内仅保留 createMany + 回读，避免长事务持锁
    const codes = await this.generateUniqueCodes(dto.count, dto.prefix);
    const createdRows = await this.prisma.$transaction(async (tx) => {
      await tx.redeemCode.createMany({
        data: codes.map((code) => ({ code, amount: dto.amount, expiresAt, note: dto.note?.trim() || null }))
      });
      return tx.redeemCode.findMany({ where: { code: { in: codes } } });
    });
    // 按生成顺序回排，保证响应 codes 与列表顺序稳定
    const rowByCode = new Map(createdRows.map((row) => [row.code, row]));
    const created = codes.map((code) => rowByCode.get(code)!);
    this.audit('redeem codes batch created', { count: created.length, amount: dto.amount, prefix: dto.prefix ?? null, expiresAt: expiresAt?.toISOString() ?? null }, operatorId);
    return { data: created.map((item) => this.toView(item, new Date())), codes: created.map((item) => item.code), total: created.length };
  }

  async revoke(id: string, operatorId?: string | null) {
    const result = await this.prisma.redeemCode.updateMany({ where: { id, status: 'UNUSED' }, data: { status: 'REVOKED' } });
    if (result.count !== 1) {
      const existing = await this.prisma.redeemCode.findUnique({ where: { id }, select: { id: true } });
      if (!existing) throw new NotFoundException('卡密不存在');
      throw new ConflictException('仅未使用卡密可以作废');
    }
    // 卡密等值现金凭据，审计只记录 id，严禁记录明文
    this.audit('redeem code revoked', { id }, operatorId);
    return { revoked: true, id };
  }

  async batchRevoke(ids: string[], operatorId?: string | null) {
    const result = await this.prisma.redeemCode.updateMany({ where: { id: { in: ids }, status: 'UNUSED' }, data: { status: 'REVOKED' } });
    this.audit('redeem codes batch revoked', { requested: ids.length, revoked: result.count }, operatorId);
    return { requested: ids.length, revoked: result.count, skipped: ids.length - result.count };
  }

  /**
   * 清理已过期超过 retentionDays 的未使用卡密（已兑换/已作废记录永久保留以供审计）
   */
  async cleanup(retentionDays: number, operatorId?: string | null) {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await this.prisma.redeemCode.deleteMany({ where: { status: 'UNUSED', expiresAt: { not: null, lt: cutoff } } });
    this.audit('expired redeem codes cleaned', { deleted: result.count, retentionDays }, operatorId);
    return { deleted: result.count, retentionDays };
  }

  private buildWhere(query: QueryRedeemCodesDto, now: Date) {
    return {
      ...(query.search ? { code: { contains: query.search } } : {}),
      ...(query.status === 'EXPIRED'
        ? { status: 'UNUSED', expiresAt: { not: null, lt: now } }
        : query.status
          ? { status: query.status }
          : {})
    };
  }

  private async generateUniqueCodes(count: number, prefix?: string) {
    const codes = new Set<string>();
    for (let round = 0; round < 5 && codes.size < count; round += 1) {
      while (codes.size < count) {
        codes.add(this.walletService.generateCode(prefix));
      }
      const conflicts = await this.prisma.redeemCode.findMany({ where: { code: { in: [...codes] } }, select: { code: true } });
      for (const row of conflicts) codes.delete(row.code);
    }
    if (codes.size < count) throw new ConflictException('卡密生成失败，请重试');
    return [...codes];
  }

  private csvCell(value: string) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  private toView(item: RedeemCodeRow, now: Date) {
    const status = item.status === 'UNUSED' && item.expiresAt && item.expiresAt <= now ? 'EXPIRED' : item.status;
    return {
      id: item.id,
      code: item.code,
      amount: item.amount,
      status,
      expiresAt: item.expiresAt,
      note: item.note,
      redeemedAt: item.redeemedAt,
      redeemedByUserId: item.redeemedByUserId,
      redeemedBy: item.redeemedBy ?? null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    };
  }

  private audit(message: string, metadata: Record<string, unknown>, operatorId?: string | null): void {
    try {
      this.systemLogsService?.enqueue({
        source: 'SERVER',
        level: 'INFO',
        module: 'REDEEM_CODE',
        message,
        metadata,
        userId: operatorId ?? null
      });
    } catch {
      // 审计日志故障不得阻断卡密管理主流程
    }
  }
}
