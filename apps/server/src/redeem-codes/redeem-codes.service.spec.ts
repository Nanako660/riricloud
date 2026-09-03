import { ConflictException, NotFoundException } from '@nestjs/common';
import { RedeemCodesService } from './redeem-codes.service';

describe('RedeemCodesService', () => {
  const prisma = {
    redeemCode: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn()
    },
    $transaction: jest.fn()
  };
  const walletService = { generateCode: jest.fn() };
  let service: RedeemCodesService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new RedeemCodesService(prisma as never, walletService as never);
  });

  it('按状态筛选并将过期未使用卡密映射为 EXPIRED', async () => {
    const expiredAt = new Date('2026-09-01T00:00:00.000Z');
    prisma.redeemCode.findMany.mockResolvedValue([
      {
        id: 'rc1',
        code: 'RIRI-EXPIRED',
        amount: 1000,
        status: 'UNUSED',
        expiresAt: expiredAt,
        note: null,
        redeemedAt: null,
        redeemedByUserId: null,
        createdAt: expiredAt,
        updatedAt: expiredAt
      }
    ]);
    prisma.redeemCode.count.mockResolvedValue(1);

    const result = await service.list({ page: 2, pageSize: 10, status: 'EXPIRED' });

    expect(result.data[0].status).toBe('EXPIRED');
    expect(prisma.redeemCode.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'UNUSED', expiresAt: { not: null, lt: expect.any(Date) } },
      skip: 10,
      take: 10
    }));
  });

  it('批量生成卡密并返回可复制的 code 列表', async () => {
    const tx = { redeemCode: { create: jest.fn() } };
    prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    walletService.generateCode
      .mockReturnValueOnce('RIRI-CODE-1')
      .mockReturnValueOnce('RIRI-CODE-2');
    tx.redeemCode.create
      .mockResolvedValueOnce({ id: 'rc1', code: 'RIRI-CODE-1', amount: 500, status: 'UNUSED', expiresAt: null, note: '活动', redeemedAt: null, redeemedByUserId: null, createdAt: new Date(), updatedAt: new Date() })
      .mockResolvedValueOnce({ id: 'rc2', code: 'RIRI-CODE-2', amount: 500, status: 'UNUSED', expiresAt: null, note: '活动', redeemedAt: null, redeemedByUserId: null, createdAt: new Date(), updatedAt: new Date() });

    const result = await service.batchCreate({ count: 2, amount: 500, prefix: 'riri', note: '活动' });

    expect(result.codes).toEqual(['RIRI-CODE-1', 'RIRI-CODE-2']);
    expect(result.total).toBe(2);
    expect(tx.redeemCode.create).toHaveBeenCalledTimes(2);
    expect(tx.redeemCode.create).toHaveBeenCalledWith(expect.objectContaining({ data: { code: 'RIRI-CODE-1', amount: 500, expiresAt: null, note: '活动' } }));
  });

  it('只允许作废未使用卡密', async () => {
    prisma.redeemCode.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.revoke('rc1')).resolves.toEqual({ revoked: true, id: 'rc1' });
    expect(prisma.redeemCode.updateMany).toHaveBeenCalledWith({ where: { id: 'rc1', status: 'UNUSED' }, data: { status: 'REVOKED' } });

    prisma.redeemCode.updateMany.mockResolvedValue({ count: 0 });
    prisma.redeemCode.findUnique.mockResolvedValue({ id: 'rc1' });
    await expect(service.revoke('rc1')).rejects.toThrow(ConflictException);

    prisma.redeemCode.findUnique.mockResolvedValue(null);
    await expect(service.revoke('missing')).rejects.toThrow(NotFoundException);
  });
});
