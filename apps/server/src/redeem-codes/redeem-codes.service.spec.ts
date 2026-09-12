import { ConflictException, NotFoundException } from '@nestjs/common';
import { RedeemCodesService } from './redeem-codes.service';

describe('RedeemCodesService', () => {
  const prisma = {
    redeemCode: {
      findMany: jest.fn(),
      count: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn()
    },
    $transaction: jest.fn()
  };
  const walletService = { generateCode: jest.fn() };
  const systemLogs = { enqueue: jest.fn() };
  let service: RedeemCodesService;

  const rowOf = (code: string, overrides: Record<string, unknown> = {}) => ({
    id: `rc-${code}`,
    code,
    amount: 500,
    status: 'UNUSED',
    expiresAt: null,
    note: null,
    redeemedAt: null,
    redeemedByUserId: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    redeemedBy: null,
    ...overrides
  });

  beforeEach(() => {
    jest.resetAllMocks();
    service = new RedeemCodesService(prisma as never, walletService as never, systemLogs as never);
  });

  it('按状态筛选并将过期未使用卡密映射为 EXPIRED', async () => {
    const expiredAt = new Date('2026-09-01T00:00:00.000Z');
    prisma.redeemCode.findMany.mockResolvedValue([rowOf('RIRI-EXPIRED', { expiresAt: expiredAt, createdAt: expiredAt, updatedAt: expiredAt })]);
    prisma.redeemCode.count.mockResolvedValue(1);

    const result = await service.list({ page: 2, pageSize: 10, status: 'EXPIRED' });

    expect(result.data[0].status).toBe('EXPIRED');
    expect(prisma.redeemCode.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'UNUSED', expiresAt: { not: null, lt: expect.any(Date) } },
      skip: 10,
      take: 10
    }));
  });

  it('列表关联返回兑换人信息', async () => {
    prisma.redeemCode.findMany.mockResolvedValue([
      rowOf('RIRI-USED', { status: 'REDEEMED', redeemedByUserId: 'u1', redeemedBy: { id: 'u1', email: 'u1@example.com', nickname: '一号' } })
    ]);
    prisma.redeemCode.count.mockResolvedValue(1);

    const result = await service.list({ page: 1, pageSize: 20 });

    expect(result.data[0].redeemedBy).toEqual({ id: 'u1', email: 'u1@example.com', nickname: '一号' });
    expect(prisma.redeemCode.findMany).toHaveBeenCalledWith(expect.objectContaining({ include: expect.anything() }));
  });

  it('批量生成卡密并返回可复制的 code 列表', async () => {
    prisma.redeemCode.findMany.mockResolvedValue([]);
    const tx = {
      redeemCode: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        findMany: jest.fn().mockResolvedValue([rowOf('RIRI-CODE-1'), rowOf('RIRI-CODE-2')])
      }
    };
    prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    walletService.generateCode.mockReturnValueOnce('RIRI-CODE-1').mockReturnValueOnce('RIRI-CODE-2');

    const result = await service.batchCreate({ count: 2, amount: 500, prefix: 'riri', note: '活动' });

    expect(result.codes).toEqual(['RIRI-CODE-1', 'RIRI-CODE-2']);
    expect(result.total).toBe(2);
    expect(tx.redeemCode.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [
        expect.objectContaining({ code: 'RIRI-CODE-1', amount: 500, note: '活动' }),
        expect.objectContaining({ code: 'RIRI-CODE-2', amount: 500, note: '活动' })
      ]
    }));
    expect(systemLogs.enqueue).toHaveBeenCalledWith(expect.objectContaining({ module: 'REDEEM_CODE', metadata: expect.objectContaining({ count: 2, amount: 500 }) }));
  });

  it('批量生成时自动替换与数据库冲突的候选码', async () => {
    prisma.redeemCode.findMany
      .mockResolvedValueOnce([{ code: 'RIRI-CODE-1' }])
      .mockResolvedValueOnce([]);
    const tx = {
      redeemCode: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        findMany: jest.fn().mockResolvedValue([rowOf('RIRI-CODE-2'), rowOf('RIRI-CODE-3')])
      }
    };
    prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    walletService.generateCode.mockReturnValueOnce('RIRI-CODE-1').mockReturnValueOnce('RIRI-CODE-2').mockReturnValueOnce('RIRI-CODE-3');

    const result = await service.batchCreate({ count: 2, amount: 100 });

    expect(result.codes).toEqual(['RIRI-CODE-2', 'RIRI-CODE-3']);
    expect(prisma.redeemCode.findMany).toHaveBeenCalledTimes(2);
  });

  it('只允许作废未使用卡密', async () => {
    prisma.redeemCode.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.revoke('rc1', 'admin1')).resolves.toEqual({ revoked: true, id: 'rc1' });
    expect(prisma.redeemCode.updateMany).toHaveBeenCalledWith({ where: { id: 'rc1', status: 'UNUSED' }, data: { status: 'REVOKED' } });
    expect(systemLogs.enqueue).toHaveBeenCalledWith(expect.objectContaining({ metadata: { id: 'rc1' }, userId: 'admin1' }));

    prisma.redeemCode.updateMany.mockResolvedValue({ count: 0 });
    prisma.redeemCode.findUnique.mockResolvedValue({ id: 'rc1' });
    await expect(service.revoke('rc1')).rejects.toThrow(ConflictException);

    prisma.redeemCode.findUnique.mockResolvedValue(null);
    await expect(service.revoke('missing')).rejects.toThrow(NotFoundException);
  });

  it('批量作废返回命中与跳过计数', async () => {
    prisma.redeemCode.updateMany.mockResolvedValue({ count: 2 });

    await expect(service.batchRevoke(['rc1', 'rc2', 'rc3'], 'admin1')).resolves.toEqual({ requested: 3, revoked: 2, skipped: 1 });
    expect(prisma.redeemCode.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['rc1', 'rc2', 'rc3'] }, status: 'UNUSED' }, data: { status: 'REVOKED' } });
    expect(systemLogs.enqueue).toHaveBeenCalledWith(expect.objectContaining({ metadata: { requested: 3, revoked: 2 } }));
  });

  it('按保留期清理过期未使用卡密', async () => {
    prisma.redeemCode.deleteMany.mockResolvedValue({ count: 3 });

    await expect(service.cleanup(30, 'admin1')).resolves.toEqual({ deleted: 3, retentionDays: 30 });
    const { where } = prisma.redeemCode.deleteMany.mock.calls[0][0];
    const cutoffMs = (where.expiresAt.lt as Date).getTime();
    expect(where.status).toBe('UNUSED');
    expect(Math.abs(cutoffMs - (Date.now() - 30 * 24 * 60 * 60 * 1000))).toBeLessThan(60_000);
  });

  it('统计口径：UNUSED 扣除已过期部分，四态互斥', async () => {
    prisma.redeemCode.groupBy.mockResolvedValue([
      { status: 'UNUSED', _count: { _all: 3 }, _sum: { amount: 3000 } },
      { status: 'REDEEMED', _count: { _all: 2 }, _sum: { amount: 2000 } }
    ]);
    prisma.redeemCode.aggregate.mockResolvedValue({ _count: { _all: 1 }, _sum: { amount: 1000 } });

    await expect(service.stats()).resolves.toEqual({
      total: 5,
      totalAmount: 5000,
      byStatus: {
        UNUSED: { count: 2, amount: 2000 },
        REDEEMED: { count: 2, amount: 2000 },
        REVOKED: { count: 0, amount: 0 },
        EXPIRED: { count: 1, amount: 1000 }
      }
    });
  });

  it('导出 TXT 仅输出卡密行，CSV 转义并列出审计字段', async () => {
    prisma.redeemCode.findMany.mockResolvedValue([
      rowOf('RIRI-A', { note: '含"引号"备注' }),
      rowOf('RIRI-B', { status: 'REDEEMED', redeemedAt: new Date('2026-09-02T00:00:00.000Z'), redeemedBy: { id: 'u1', email: 'u1@example.com', nickname: '一号' } })
    ]);

    await expect(service.export({} as never, 'txt')).resolves.toBe('RIRI-A\nRIRI-B');

    const csv = await service.export({} as never, 'csv');
    const lines = csv.split('\n');
    expect(lines[0]).toBe('id,code,amount,status,expiresAt,note,redeemedAt,redeemedBy,createdAt');
    expect(lines[1]).toContain('"含""引号""备注"');
    expect(lines[2]).toContain('REDEEMED');
    expect(lines[2]).toContain('u1@example.com');
    expect(prisma.redeemCode.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: expect.any(Number) }));
  });
});
