import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { QueryTransactionsDto } from './dto/query-transactions.dto';

export const BALANCE_TRANSACTION_TYPES = ['SYSTEM_GIFT', 'REDEEM', 'PLAN_BUY', 'PLAN_RENEW', 'PLAN_UPGRADE', 'ADMIN_ADJUST'] as const;
export type BalanceTransactionType = (typeof BALANCE_TRANSACTION_TYPES)[number];

type BalanceClient = Prisma.TransactionClient;
type BalanceTransactionRecord = {
  id: string;
  userId: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  type: string;
  description: string | null;
  referenceId: string | null;
  redeemCodeId: string | null;
  createdAt: Date;
};

export interface BalanceChangeResult {
  balance: number;
  transaction: ReturnType<WalletService['toTransactionView']>;
}

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async getWallet(userId: string) {
    const [user, income, expense, transactionCount] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { balance: true } }),
      this.prisma.balanceTransaction.aggregate({ where: { userId, amount: { gt: 0 } }, _sum: { amount: true } }),
      this.prisma.balanceTransaction.aggregate({ where: { userId, amount: { lt: 0 } }, _sum: { amount: true } }),
      this.prisma.balanceTransaction.count({ where: { userId } })
    ]);
    if (!user) throw new NotFoundException('用户不存在');
    return {
      balance: user.balance,
      totalIncome: income._sum.amount ?? 0,
      totalExpense: Math.abs(expense._sum.amount ?? 0),
      transactionCount
    };
  }

  async listTransactions(userId: string, query: QueryTransactionsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = { userId };
    const [data, total] = await Promise.all([
      this.prisma.balanceTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.balanceTransaction.count({ where })
    ]);
    return { data: data.map((item) => this.toTransactionView(item)), total, page, pageSize };
  }

  async redeem(userId: string, codeInput: string) {
    const code = normalizeCode(codeInput);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const redeemCode = await tx.redeemCode.findUnique({ where: { code } });
      if (!redeemCode) throw new NotFoundException('卡密不存在');
      if (redeemCode.status !== 'UNUSED') throw new ConflictException('卡密已使用或已作废');
      if (redeemCode.expiresAt && redeemCode.expiresAt <= now) throw new ConflictException('卡密已过期');

      const claimed = await tx.redeemCode.updateMany({
        where: {
          id: redeemCode.id,
          status: 'UNUSED',
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
        },
        data: { status: 'REDEEMED', redeemedAt: now, redeemedByUserId: userId }
      });
      if (claimed.count !== 1) throw new ConflictException('卡密已使用或已作废');

      const result = await this.applyBalanceChange(tx, userId, redeemCode.amount, 'REDEEM', '卡密充值', redeemCode.id, redeemCode.id);
      return { code: redeemCode.code, amount: redeemCode.amount, ...result };
    });
  }

  async adjustBalance(userId: string, amount: number, type: BalanceTransactionType, description?: string, referenceId?: string) {
    return this.prisma.$transaction((tx) => this.applyBalanceChange(tx, userId, amount, type, description, referenceId));
  }

  async applyBalanceChange(
    tx: BalanceClient,
    userId: string,
    amount: number,
    type: BalanceTransactionType,
    description?: string,
    referenceId?: string,
    redeemCodeId?: string
  ): Promise<BalanceChangeResult> {
    if (!Number.isSafeInteger(amount) || amount === 0) throw new BadRequestException('余额变动金额必须为非零整数');
    const user = await tx.user.findUnique({ where: { id: userId }, select: { balance: true } });
    if (!user) throw new NotFoundException('用户不存在');
    const balanceAfter = user.balance + amount;
    if (balanceAfter < 0) throw new BadRequestException('余额不足');

    const updated = await tx.user.update({
      where: { id: userId },
      data: { balance: { increment: amount } },
      select: { balance: true }
    });
    const transaction = await tx.balanceTransaction.create({
      data: {
        userId,
        amount,
        balanceBefore: updated.balance - amount,
        balanceAfter: updated.balance,
        type,
        description: description ?? null,
        referenceId: referenceId ?? null,
        redeemCodeId: redeemCodeId ?? null
      }
    });
    return { balance: updated.balance, transaction: this.toTransactionView(transaction) };
  }

  generateCode(prefix?: string) {
    const normalizedPrefix = prefix?.trim().toUpperCase();
    const suffix = randomBytes(16).toString('hex').toUpperCase();
    return normalizedPrefix ? `${normalizedPrefix}-${suffix}` : suffix;
  }

  private toTransactionView(record: BalanceTransactionRecord) {
    return {
      id: record.id,
      userId: record.userId,
      amount: record.amount,
      balanceBefore: record.balanceBefore,
      balanceAfter: record.balanceAfter,
      type: record.type,
      description: record.description,
      referenceId: record.referenceId,
      redeemCodeId: record.redeemCodeId,
      createdAt: record.createdAt
    };
  }
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}
