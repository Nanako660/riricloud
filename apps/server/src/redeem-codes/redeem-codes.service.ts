import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BatchRedeemCodesDto } from './dto/batch-redeem-codes.dto';
import { QueryRedeemCodesDto } from './dto/query-redeem-codes.dto';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class RedeemCodesService {
  constructor(private readonly prisma: PrismaService, private readonly walletService: WalletService) {}

  async list(query: QueryRedeemCodesDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const now = new Date();
    const where = {
      ...(query.search ? { code: { contains: query.search } } : {}),
      ...(query.status === 'EXPIRED'
        ? { status: 'UNUSED', expiresAt: { not: null, lt: now } }
        : query.status
          ? { status: query.status }
          : {})
    };
    const [data, total] = await Promise.all([
      this.prisma.redeemCode.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.redeemCode.count({ where })
    ]);
    return { data: data.map((item) => this.toView(item, now)), total, page, pageSize };
  }

  async batchCreate(dto: BatchRedeemCodesDto) {
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    const codes = await this.prisma.$transaction(async (tx) => {
      const created: Array<{ id: string; code: string; amount: number; status: string; expiresAt: Date | null; note: string | null; redeemedAt: Date | null; redeemedByUserId: string | null; createdAt: Date; updatedAt: Date }> = [];
      const generated = new Set<string>();
      for (let index = 0; index < dto.count; index += 1) {
        let code = '';
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const candidate = this.walletService.generateCode(dto.prefix);
          if (!generated.has(candidate)) {
            code = candidate;
            break;
          }
        }
        if (!code) throw new ConflictException('卡密生成失败，请重试');
        generated.add(code);
        created.push(await tx.redeemCode.create({
          data: { code, amount: dto.amount, expiresAt, note: dto.note?.trim() || null }
        }));
      }
      return created;
    });
    return { data: codes.map((item) => this.toView(item, new Date())), codes: codes.map((item) => item.code), total: codes.length };
  }

  async revoke(id: string) {
    const result = await this.prisma.redeemCode.updateMany({ where: { id, status: 'UNUSED' }, data: { status: 'REVOKED' } });
    if (result.count !== 1) {
      const existing = await this.prisma.redeemCode.findUnique({ where: { id }, select: { id: true } });
      if (!existing) throw new NotFoundException('卡密不存在');
      throw new ConflictException('仅未使用卡密可以作废');
    }
    return { revoked: true, id };
  }

  private toView(item: {
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
  }, now: Date) {
    const status = item.status === 'UNUSED' && item.expiresAt && item.expiresAt <= now ? 'EXPIRED' : item.status;
    return { ...item, status };
  }
}
