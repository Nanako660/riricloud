import { ConflictException } from '@nestjs/common';
import { PlanPurchasesService } from './plan-purchases.service';

describe('PlanPurchasesService', () => {
  const originalJwtSecret = process.env.JWT_SECRET;
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    planPurchaseIdentity: { create: jest.fn() },
    planPurchaseEmailAlias: { findUnique: jest.fn(), create: jest.fn() },
    planPurchase: { count: jest.fn(), create: jest.fn(), groupBy: jest.fn() }
  };
  const service = new PlanPurchasesService(prisma as never);
  const user = {
    id: 'u1',
    email: 'User@Example.com',
    planPurchaseIdentityId: 'identity-1'
  };

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-for-plan-purchases-service-0123456789';
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.user.update.mockResolvedValue(user);
    prisma.planPurchaseEmailAlias.findUnique.mockResolvedValue({ identityId: 'identity-1' });
    prisma.planPurchaseEmailAlias.create.mockResolvedValue({});
    prisma.planPurchase.create.mockImplementation(async ({ data }) => ({ id: 'purchase-1', ...data }));
  });

  afterAll(() => {
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  });

  it('免费套餐首次领取按序号 1 写入台账', async () => {
    prisma.planPurchase.count.mockResolvedValue(0);

    await expect(service.claim('u1', { id: 'free', purchaseLimitPerUser: 1 }, 'SELF_BUY', 'sub-1'))
      .resolves.toBe('purchase-1');
    expect(prisma.planPurchase.create).toHaveBeenCalledWith({
      data: {
        identityId: 'identity-1',
        planId: 'free',
        sequence: 1,
        source: 'SELF_BUY',
        subscriptionId: 'sub-1'
      }
    });
  });

  it('免费套餐已领取后再次购买返回 ConflictException', async () => {
    prisma.planPurchase.count.mockResolvedValue(1);

    await expect(service.claim('u1', { id: 'free', purchaseLimitPerUser: 1 }, 'SELF_BUY', null))
      .rejects.toThrow(ConflictException);
    expect(prisma.planPurchase.create).not.toHaveBeenCalled();
  });

  it('并发写入触发唯一约束时返回 ConflictException', async () => {
    prisma.planPurchase.count.mockResolvedValue(0);
    prisma.planPurchase.create.mockRejectedValue({ code: 'P2002' });

    await expect(service.claim('u1', { id: 'free', purchaseLimitPerUser: 1 }, 'SELF_BUY', null))
      .rejects.toThrow('请勿重复提交');
  });

  it('限购 N 次时第 N+1 次拒绝，管理员破例可继续记账', async () => {
    prisma.planPurchase.count.mockResolvedValue(2);

    await expect(service.claim('u1', { id: 'limited', purchaseLimitPerUser: 2 }, 'SELF_BUY', null))
      .rejects.toThrow('限购 2 次');
    await expect(service.claim(
      'u1',
      { id: 'limited', purchaseLimitPerUser: 2 },
      'ADMIN',
      'sub-1',
      prisma as never,
      { allowExceedLimit: true }
    )).resolves.toBe('purchase-1');
    expect(prisma.planPurchase.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ sequence: 3, source: 'ADMIN' })
    });
  });

  it('不限制购买的套餐不读取已有次数上限', async () => {
    prisma.planPurchase.count.mockResolvedValue(99);

    await expect(service.claim('u1', { id: 'paid', purchaseLimitPerUser: null }, 'SELF_BUY', null))
      .resolves.toBe('purchase-1');
    expect(prisma.planPurchase.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ planId: 'paid', sequence: 100 })
    });
  });

  it('账号删除后同邮箱重建会复用历史购买身份', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u2',
      email: 'user@example.com',
      planPurchaseIdentityId: null
    });
    prisma.planPurchaseEmailAlias.findUnique.mockResolvedValue({ identityId: 'identity-old' });

    await expect(service.ensureIdentityForUser('u2')).resolves.toBe('identity-old');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u2' },
      data: { planPurchaseIdentityId: 'identity-old' }
    });
  });
});
