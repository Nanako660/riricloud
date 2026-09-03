import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AgentGatewayService } from '../agent-gateway/agent-gateway.service';
import { LinesService } from '../lines/lines.service';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionService } from './subscription.service';
import { WalletService } from '../wallet/wallet.service';

describe('SubscriptionService lifecycle', () => {
  let service: SubscriptionService;
  const plan = {
    id: 'p1', name: '体验', isPublic: true, price: 1000, durationDays: 30, trafficLimitBytes: BigInt(1000),
    lineMatchMode: 'ALL', lineTagsJson: '[]', lineIdsJson: '[]', template: null
  };
  const subscription = {
    id: 's1', userId: 'u1', planId: 'p1', status: 'ACTIVE', trafficLimitBytes: BigInt(1000), trafficUsedBytes: BigInt(0),
    startedAt: new Date(), expireAt: new Date(Date.now() + 86400000), subscriptionToken: 'token', canceledAt: null,
    createdAt: new Date(), updatedAt: new Date(), plan, user: { id: 'u1', email: 'u@example.com', uuid: 'uuid', password: null, isActive: true, expireAt: null, trafficLimitBytes: BigInt(1000), trafficUsedBytes: BigInt(0) }
  };
  const tx = {
    subscription: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    user: { update: jest.fn() },
    balanceTransaction: { create: jest.fn() }
  };
  const prisma = {
    plan: { findUnique: jest.fn() },
    subscription: { findUnique: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn(), update: jest.fn() },
    node: { findMany: jest.fn() },
    $transaction: jest.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx))
  };
  const gateway = { pushConfigToAll: jest.fn() };
  const linesService = { getAvailableForPlan: jest.fn() };
  const walletService = { applyBalanceChange: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [SubscriptionService, { provide: PrismaService, useValue: prisma }, { provide: AgentGatewayService, useValue: gateway }, { provide: LinesService, useValue: linesService }, { provide: WalletService, useValue: walletService }]
    }).compile();
    service = moduleRef.get(SubscriptionService);
  });

  afterEach(() => jest.clearAllMocks());

  it('首次订购创建唯一订阅并同步 User 镜像字段', async () => {
    prisma.plan.findUnique.mockResolvedValue(plan);
    tx.subscription.findUnique.mockResolvedValue(null);
    tx.subscription.create.mockResolvedValue(subscription);
    prisma.subscription.findUnique.mockResolvedValue(subscription);
    await service.subscribe('u1', 'p1');
    expect(tx.subscription.create).toHaveBeenCalled();
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1' } }));
    expect(gateway.pushConfigToAll).toHaveBeenCalled();
  });

  it('有效订阅再次订购被拒绝，防止 1:1 重复实例', async () => {
    prisma.plan.findUnique.mockResolvedValue(plan);
    tx.subscription.findUnique.mockResolvedValue(subscription);
    await expect(service.subscribe('u1', 'p1')).rejects.toThrow(ConflictException);
  });

  it('管理员为无订阅用户绑定套餐时在事务内创建订阅并同步 User 镜像', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u2' });
    prisma.plan.findUnique.mockResolvedValue(plan);
    prisma.subscription.findUnique.mockReset();
    prisma.subscription.findUnique.mockResolvedValueOnce(null);
    tx.subscription.create.mockResolvedValue({ ...subscription, id: 's2', userId: 'u2' });
    prisma.subscription.findUnique.mockResolvedValueOnce({ ...subscription, id: 's2', userId: 'u2' });

    await service.adminAssign('u2', { planId: 'p1' });

    expect(tx.subscription.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 'u2', planId: 'p1', status: 'ACTIVE' })
    }));
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u2' } }));
  });

  it('管理员选择无套餐时删除订阅并使旧 Token 失效', async () => {
    prisma.subscription.findUnique.mockResolvedValue(subscription);

    const result = await service.adminUpdate('s1', { planId: null });

    expect(tx.subscription.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { subscriptionToken: expect.any(String) }
    });
    expect(result).toEqual({ removed: true, id: 's1', userId: 'u1' });
    expect(gateway.pushConfigToAll).toHaveBeenCalled();
  });

  it('首次订购付费套餐会在订阅事务内扣除余额', async () => {
    const paidPlan = { ...plan, price: 1999 };
    prisma.plan.findUnique.mockResolvedValue(paidPlan);
    tx.subscription.findUnique.mockResolvedValue(null);
    tx.subscription.create.mockResolvedValue({ ...subscription, plan: paidPlan });
    prisma.subscription.findUnique.mockResolvedValue({ ...subscription, plan: paidPlan });

    await service.subscribe('u1', 'p1');

    expect(walletService.applyBalanceChange).toHaveBeenCalledWith(
      tx,
      'u1',
      -1999,
      'PLAN_BUY',
      '订购套餐',
      's1'
    );
  });

  it('续费会顺延周期、重置流量并扣除当前套餐价格', async () => {
    const paidPlan = { ...plan, price: 500 };
    prisma.subscription.findUnique.mockResolvedValue(subscription);
    prisma.plan.findUnique.mockResolvedValue(paidPlan);
    tx.subscription.update.mockResolvedValue({ ...subscription, plan: paidPlan, trafficUsedBytes: BigInt(0) });
    prisma.subscription.findUnique.mockResolvedValue({ ...subscription, plan: paidPlan, trafficUsedBytes: BigInt(0) });

    await service.renew('u1');

    expect(tx.subscription.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 's1' },
      data: expect.objectContaining({ status: 'ACTIVE', trafficUsedBytes: BigInt(0) })
    }));
    expect(walletService.applyBalanceChange).toHaveBeenCalledWith(
      tx,
      'u1',
      -500,
      'PLAN_RENEW',
      '续费套餐',
      's1'
    );
  });

  it('禁止向价格更低的套餐升配', async () => {
    const lowerPlan = { ...plan, id: 'p2', name: '低价套餐', price: 500 };
    prisma.plan.findUnique.mockResolvedValue(lowerPlan);
    prisma.subscription.findUnique.mockResolvedValue(subscription);

    await expect(service.upgrade('u1', 'p2')).rejects.toThrow('不能升级到价格更低的套餐');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
