import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  let service: WalletService;
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    balanceTransaction: { aggregate: jest.fn(), count: jest.fn(), findMany: jest.fn(), create: jest.fn() },
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
    await expect(service.getWallet('u1')).resolves.toEqual({ balance: 1250, totalIncome: 3000, totalExpense: 1750, transactionCount: 4 });
  });

  it('事务内增加余额并创建关联卡密的账务流水', async () => {
    const now = new Date();
    const tx = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ balance: 500 }),
        update: jest.fn().mockResolvedValue({ balance: 1500 })
      },
      balanceTransaction: {
        create: jest.fn().mockResolvedValue({ id: 'bt1', userId: 'u1', amount: 1000, balanceBefore: 500, balanceAfter: 1500, type: 'REDEEM', description: '卡密充值', referenceId: 'rc1', redeemCodeId: 'rc1', createdAt: now })
      }
    };
    const result = await service.applyBalanceChange(tx as never, 'u1', 1000, 'REDEEM', '卡密充值', 'rc1', 'rc1');
    expect(result.balance).toBe(1500);
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1' }, data: { balance: { increment: 1000 } } }));
    expect(tx.balanceTransaction.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: 1000, redeemCodeId: 'rc1' }) }));
  });

  it('拒绝把余额调到负数', async () => {
    const tx = {
      user: { findUnique: jest.fn().mockResolvedValue({ balance: 100 }), update: jest.fn() },
      balanceTransaction: { create: jest.fn() }
    };
    await expect(service.applyBalanceChange(tx as never, 'u1', -101, 'ADMIN_ADJUST')).rejects.toThrow(BadRequestException);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('限流拒绝兑换尝试并返回 429', () => {
    const consume = jest.fn().mockReturnValue(false);
    const limited = new WalletService(prisma as never, { consume } as never);
    expect(() => limited.assertRedeemRateLimit('u1')).toThrow(HttpException);
    expect(consume).toHaveBeenCalledWith('wallet-redeem:u1', expect.any(Number), expect.any(Number));
  });

  it('限流窗口内允许继续进入兑换履约', () => {
    const consume = jest.fn().mockReturnValue(true);
    const limited = new WalletService(prisma as never, { consume } as never);
    expect(() => limited.assertRedeemRateLimit('u1')).not.toThrow();
    expect(consume).toHaveBeenCalledTimes(1);
  });

  it('调整余额仍在同一数据库事务中执行', async () => {
    const tx = {
      user: { findUnique: jest.fn().mockResolvedValue({ balance: 100 }), update: jest.fn().mockResolvedValue({ balance: 150 }) },
      balanceTransaction: { create: jest.fn().mockResolvedValue({ id: 'bt2', userId: 'u1', amount: 50, balanceBefore: 100, balanceAfter: 150, type: 'ADMIN_ADJUST', description: null, referenceId: null, redeemCodeId: null, createdAt: new Date() }) }
    };
    prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    await expect(service.adjustBalance('u1', 50, 'ADMIN_ADJUST')).resolves.toMatchObject({ balance: 150 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('查询不存在的用户时抛出 NotFoundException', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getWallet('missing')).rejects.toThrow(NotFoundException);
  });
});
