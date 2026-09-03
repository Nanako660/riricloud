import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  let service: WalletService;
  const prisma = {
    user: { findUnique: jest.fn() },
    balanceTransaction: { aggregate: jest.fn(), count: jest.fn(), findMany: jest.fn() },
    redeemCode: { findUnique: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn()
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [WalletService, { provide: PrismaService, useValue: prisma }]
    }).compile();
    service = moduleRef.get(WalletService);
  });

  afterEach(() => jest.resetAllMocks());

  it('返回余额、累计充值和累计消费统计', async () => {
    prisma.user.findUnique.mockResolvedValue({ balance: 1250 });
    prisma.balanceTransaction.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 3000 } })
      .mockResolvedValueOnce({ _sum: { amount: -1750 } });
    prisma.balanceTransaction.count.mockResolvedValue(4);

    await expect(service.getWallet('u1')).resolves.toEqual({
      balance: 1250,
      totalIncome: 3000,
      totalExpense: 1750,
      transactionCount: 4
    });
  });

  it('卡密核销与余额流水在同一事务内完成', async () => {
    const now = new Date();
    const tx = {
      redeemCode: {
        findUnique: jest.fn().mockResolvedValue({ id: 'rc1', code: 'RIRI-ABC', amount: 1000, status: 'UNUSED', expiresAt: new Date(now.getTime() + 60000) }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ balance: 500 }),
        update: jest.fn().mockResolvedValue({ balance: 1500 })
      },
      balanceTransaction: {
        create: jest.fn().mockResolvedValue({ id: 'bt1', userId: 'u1', amount: 1000, balanceBefore: 500, balanceAfter: 1500, type: 'REDEEM', description: '卡密充值', referenceId: 'rc1', redeemCodeId: 'rc1', createdAt: now })
      }
    };
    prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));

    await expect(service.redeem('u1', ' riri-abc ')).resolves.toMatchObject({ code: 'RIRI-ABC', amount: 1000, balance: 1500 });
    expect(tx.redeemCode.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'rc1', status: 'UNUSED' }) }));
    expect(tx.balanceTransaction.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: 1000, redeemCodeId: 'rc1' }) }));
  });

  it('并发抢兑时只允许成功领取卡密的事务继续', async () => {
    const tx = {
      redeemCode: {
        findUnique: jest.fn().mockResolvedValue({ id: 'rc1', code: 'RIRI-ABC', amount: 1000, status: 'UNUSED', expiresAt: null }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 })
      }
    };
    prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    await expect(service.redeem('u1', 'RIRI-ABC')).rejects.toThrow(ConflictException);
  });

  it('拒绝把余额调到负数', async () => {
    const tx = {
      user: { findUnique: jest.fn().mockResolvedValue({ balance: 100 }), update: jest.fn() },
      balanceTransaction: { create: jest.fn() }
    };
    prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    await expect(service.adjustBalance('u1', -101, 'ADMIN_ADJUST')).rejects.toThrow(BadRequestException);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('查询不存在的用户时抛出 NotFoundException', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getWallet('missing')).rejects.toThrow(NotFoundException);
  });
});
