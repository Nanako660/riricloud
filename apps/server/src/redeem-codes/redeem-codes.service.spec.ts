import { ConflictException } from '@nestjs/common';
import { RedeemCodesService } from './redeem-codes.service';

describe('RedeemCodesService', () => {
  const prisma = {
    redeemCode: {
      findMany: jest.fn(), count: jest.fn(), createMany: jest.fn(), updateMany: jest.fn(),
      findUnique: jest.fn(), groupBy: jest.fn(), aggregate: jest.fn()
    },
    redeemCodeCategory: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    plan: { findUnique: jest.fn() },
    $transaction: jest.fn()
  };
  const walletService = {
    generateCode: jest.fn(), assertRedeemRateLimit: jest.fn(), applyBalanceChange: jest.fn()
  };
  const subscriptions = { activateRedeemedPlan: jest.fn(), notifyFulfillmentCompleted: jest.fn() };
  const planPurchases = { ensureIdentityForUser: jest.fn() };
  const systemLogs = { enqueue: jest.fn() };
  let service: RedeemCodesService;

  const category = (overrides: Record<string, unknown> = {}) => ({
    id: 'cat1', name: '新用户', tagsJson: '["活动"]', rewardType: 'BALANCE', rewardAmount: 500,
    planId: null, limitPerIdentity: 1, isActive: true,
    createdAt: new Date('2026-09-01T00:00:00.000Z'), updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides
  });
  const rowOf = (code: string, overrides: Record<string, unknown> = {}) => ({
    id: `rc-${code}`, code, amount: 500, rewardType: 'BALANCE', rewardSnapshotJson: '{"type":"BALANCE","amount":500}',
    planId: null, categoryId: 'cat1', category: category(), status: 'UNUSED', expiresAt: null, note: null,
    redeemedAt: null, redeemedByUserId: null, deletedAt: null, deletedByUserId: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'), updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    redeemedBy: null, ...overrides
  });
  const makeTx = (options: { row?: ReturnType<typeof rowOf> | null; claimed?: number; quota?: Array<{ usedCount: number }> } = {}) => ({
    redeemCode: {
      findUnique: jest.fn().mockResolvedValue(options.row === undefined ? rowOf('RIRI-ABC') : options.row),
      updateMany: jest.fn().mockResolvedValue({ count: options.claimed ?? 1 }),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([rowOf('RIRI-NEW')])
    },
    $queryRaw: jest.fn().mockResolvedValue(options.quota ?? [{ usedCount: 1 }])
  });

  beforeEach(() => {
    jest.resetAllMocks();
    service = new RedeemCodesService(prisma as never, walletService as never, subscriptions as never, planPurchases as never, systemLogs as never);
  });

  it('列表默认排除软删除记录，并将过期未使用卡密映射为 EXPIRED', async () => {
    const expiredAt = new Date(Date.now() - 60_000);
    prisma.redeemCode.findMany.mockResolvedValue([rowOf('RIRI-EXPIRED', { expiresAt: expiredAt })]);
    prisma.redeemCode.count.mockResolvedValue(1);
    const result = await service.list({ page: 2, pageSize: 10, status: 'EXPIRED' });
    expect(result.data[0].status).toBe('EXPIRED');
    expect(prisma.redeemCode.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { deletedAt: null, status: 'UNUSED', expiresAt: { not: null, lt: expect.any(Date) } }, skip: 10, take: 10
    }));
  });

  it('套餐卡列表缺少奖励快照时不伪装成余额卡', async () => {
    prisma.redeemCode.findMany.mockResolvedValue([rowOf('PLAN-MISSING', { amount: 0, rewardType: 'PLAN', planId: 'p1', rewardSnapshotJson: null })]);
    prisma.redeemCode.count.mockResolvedValue(1);
    await expect(service.list({})).rejects.toThrow('套餐卡奖励快照缺失');
  });

  it('已删除视图可查询软删除卡密', async () => {
    prisma.redeemCode.findMany.mockResolvedValue([rowOf('RIRI-HIDDEN', { deletedAt: new Date() })]);
    prisma.redeemCode.count.mockResolvedValue(1);
    await service.list({ deletedOnly: true });
    expect(prisma.redeemCode.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deletedAt: { not: null } } }));
  });

  it('生成批次保存分类奖励快照，不因后续分类修改而改变', async () => {
    prisma.redeemCodeCategory.findUnique.mockResolvedValue(category());
    prisma.redeemCode.findMany.mockResolvedValue([]);
    const tx = makeTx();
    tx.redeemCode.createMany.mockResolvedValue({ count: 2 });
    tx.redeemCode.findMany.mockResolvedValue([rowOf('RIRI-CODE-1'), rowOf('RIRI-CODE-2')]);
    prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    walletService.generateCode.mockReturnValueOnce('RIRI-CODE-1').mockReturnValueOnce('RIRI-CODE-2');

    const result = await service.batchCreate({ count: 2, categoryId: 'cat1', prefix: 'riri', note: '活动' });
    expect(result.codes).toEqual(['RIRI-CODE-1', 'RIRI-CODE-2']);
    expect(tx.redeemCode.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.arrayContaining([
      expect.objectContaining({ code: 'RIRI-CODE-1', amount: 500, categoryId: 'cat1', rewardSnapshotJson: '{"type":"BALANCE","amount":500}', note: '活动' })
    ]) }));
    expect(systemLogs.enqueue).toHaveBeenCalledWith(expect.objectContaining({ module: 'REDEEM_CODE', metadata: expect.not.objectContaining({ codes: expect.anything() }) }));
  });

  it('创建余额分类使用 planId 标量空值，不提交无效的嵌套 disconnect', async () => {
    prisma.redeemCodeCategory.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...category(), ...data, id: 'new-category' }));
    await service.createCategory({ name: '测试分类', tags: ['test'], rewardType: 'BALANCE', rewardAmount: 1000 });

    const [argument] = prisma.redeemCodeCategory.create.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(argument.data).toMatchObject({ name: '测试分类', tagsJson: '["test"]', rewardType: 'BALANCE', rewardAmount: 1000, planId: null });
    expect(argument.data).not.toHaveProperty('plan');
  });

  it('套餐分类改为余额奖励时通过 planId 清除套餐关联', async () => {
    prisma.redeemCodeCategory.findUnique.mockResolvedValue(category({ rewardType: 'PLAN', rewardAmount: null, planId: 'plan-1' }));
    prisma.redeemCodeCategory.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...category(), ...data, id: 'cat1' }));
    await service.updateCategory('cat1', { rewardType: 'BALANCE', rewardAmount: 1000 });

    const [argument] = prisma.redeemCodeCategory.update.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(argument.data).toMatchObject({ rewardType: 'BALANCE', rewardAmount: 1000, planId: null });
    expect(argument.data).not.toHaveProperty('plan');
  });

  it('停用分類禁止生成新卡', async () => {
    prisma.redeemCodeCategory.findUnique.mockResolvedValue(category({ isActive: false }));
    await expect(service.batchCreate({ count: 1, categoryId: 'cat1' })).rejects.toThrow(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('分类上限为 null 时 ValidationPipe 保留“不限”语义', async () => {
    const { ValidationPipe } = await import('@nestjs/common');
    const { CreateRedeemCodeCategoryDto } = await import('./dto/redeem-code-category.dto');
    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    const dto = await pipe.transform({ name: '无限', rewardType: 'BALANCE', rewardAmount: 100, limitPerIdentity: null }, { type: 'body', metatype: CreateRedeemCodeCategoryDto });
    expect(dto.limitPerIdentity).toBeNull();
  });

  it('余额兑换事务内领取卡密、占用购买身份额度并入账', async () => {
    const tx = makeTx({ row: rowOf('RIRI-ABC', { deletedAt: new Date() }) });
    prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    planPurchases.ensureIdentityForUser.mockResolvedValue('identity1');
    walletService.applyBalanceChange.mockResolvedValue({ balance: 700, transaction: { id: 'bt1' } });

    await expect(service.redeem('u1', ' riri-abc ')).resolves.toMatchObject({ code: 'RIRI-ABC', rewardType: 'BALANCE', amount: 500, balance: 700 });
    expect(tx.redeemCode.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'rc-RIRI-ABC', status: 'UNUSED' }) }));
    expect(planPurchases.ensureIdentityForUser).toHaveBeenCalledWith('u1', tx);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(walletService.applyBalanceChange).toHaveBeenCalledWith(tx, 'u1', 500, 'REDEEM', '卡密充值', 'rc-RIRI-ABC', 'rc-RIRI-ABC');
  });

  it('额度耗尽时回滚兑换且不发放余额', async () => {
    const tx = makeTx({ quota: [] });
    prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    planPurchases.ensureIdentityForUser.mockResolvedValue('identity1');
    await expect(service.redeem('u1', 'RIRI-ABC')).rejects.toThrow('已达到此分类的卡密兑换上限');
    expect(walletService.applyBalanceChange).not.toHaveBeenCalled();
  });

  it('同一卡密并发核销失败时不得继续占额度或发奖', async () => {
    const tx = makeTx({ claimed: 0 });
    prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    await expect(service.redeem('u1', 'RIRI-ABC')).rejects.toThrow(ConflictException);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(walletService.applyBalanceChange).not.toHaveBeenCalled();
  });

  it('无有效期卡片仍可兑换且软删除不阻止兑换', async () => {
    const tx = makeTx({ row: rowOf('RIRI-HIDDEN', { deletedAt: new Date() }) });
    prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    planPurchases.ensureIdentityForUser.mockResolvedValue('identity1');
    walletService.applyBalanceChange.mockResolvedValue({ balance: 500, transaction: {} });
    await expect(service.redeem('u1', 'RIRI-HIDDEN')).resolves.toMatchObject({ balance: 500 });
  });

  it('套餐卡使用发卡快照履约并触发订阅同步', async () => {
    const snapshot = { type: 'PLAN', planId: 'p1', planSnapshot: { id: 'p1', name: '快照套餐' } };
    const tx = makeTx({ row: rowOf('PLAN-CODE', { amount: 0, rewardType: 'PLAN', planId: 'p1', rewardSnapshotJson: JSON.stringify(snapshot) }) });
    prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    subscriptions.activateRedeemedPlan.mockResolvedValue({ id: 'sub1' });
    await expect(service.redeem('u1', 'PLAN-CODE')).resolves.toMatchObject({ rewardType: 'PLAN', plan: { id: 'sub1' } });
    expect(subscriptions.activateRedeemedPlan).toHaveBeenCalledWith('u1', snapshot.planSnapshot, tx);
    expect(subscriptions.notifyFulfillmentCompleted).toHaveBeenCalledTimes(1);
    expect(walletService.applyBalanceChange).not.toHaveBeenCalled();
  });

  it('套餐履约遇到有效订阅冲突时不发放其他奖励', async () => {
    const snapshot = { type: 'PLAN', planId: 'p1', planSnapshot: { id: 'p1', name: '快照套餐' } };
    const tx = makeTx({ row: rowOf('PLAN-CODE', { amount: 0, rewardType: 'PLAN', planId: 'p1', rewardSnapshotJson: JSON.stringify(snapshot) }) });
    prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    subscriptions.activateRedeemedPlan.mockRejectedValue(new ConflictException('已有有效订阅'));
    await expect(service.redeem('u1', 'PLAN-CODE')).rejects.toThrow('已有有效订阅');
    expect(walletService.applyBalanceChange).not.toHaveBeenCalled();
    expect(subscriptions.notifyFulfillmentCompleted).not.toHaveBeenCalled();
  });

  it('显式作废只允许未使用卡密', async () => {
    prisma.redeemCode.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.revoke('rc1', 'admin1')).resolves.toEqual({ revoked: true, id: 'rc1' });
    expect(prisma.redeemCode.updateMany).toHaveBeenCalledWith({ where: { id: 'rc1', status: 'UNUSED' }, data: { status: 'REVOKED' } });
    expect(systemLogs.enqueue).toHaveBeenCalledWith(expect.objectContaining({ metadata: { id: 'rc1' }, userId: 'admin1' }));
  });

  it('删除与恢复只更新软删除字段，过期清理不物理删除', async () => {
    prisma.redeemCode.updateMany.mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 3 });
    await expect(service.softDelete(['rc1', 'rc2'], 'admin1')).resolves.toEqual({ requested: 2, deleted: 2, skipped: 0 });
    expect(prisma.redeemCode.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { id: { in: ['rc1', 'rc2'] }, deletedAt: null }, data: expect.objectContaining({ deletedByUserId: 'admin1', deletedAt: expect.any(Date) }) }));
    await expect(service.restore('rc1', 'admin1')).resolves.toEqual({ restored: true, id: 'rc1' });
    expect(prisma.redeemCode.updateMany).toHaveBeenNthCalledWith(2, { where: { id: 'rc1', deletedAt: { not: null } }, data: { deletedAt: null, deletedByUserId: null } });
    await expect(service.cleanup(30, 'admin1')).resolves.toEqual({ deleted: 3, retentionDays: 30 });
    expect(prisma.redeemCode.updateMany).toHaveBeenNthCalledWith(3, expect.objectContaining({ where: expect.objectContaining({ status: 'UNUSED', deletedAt: null, expiresAt: expect.objectContaining({ lt: expect.any(Date) }) }) }));
  });

  it('导出默认排除软删除卡密并保留 CSV 审计字段', async () => {
    prisma.redeemCode.findMany.mockResolvedValue([rowOf('RIRI-A', { note: '含"引号"备注' })]);
    const csv = await service.export({} as never, 'csv');
    const lines = csv.split('\n');
    expect(lines[0]).toBe('id,code,rewardType,amount,category,status,expiresAt,note,redeemedAt,redeemedBy,createdAt');
    expect(lines[1]).toContain('"含""引号""备注"');
    expect(prisma.redeemCode.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }), take: expect.any(Number) }));
  });
});
