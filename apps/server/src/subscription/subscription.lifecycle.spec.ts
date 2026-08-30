import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AgentGatewayService } from '../agent-gateway/agent-gateway.service';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionService } from './subscription.service';

describe('SubscriptionService lifecycle', () => {
  let service: SubscriptionService;
  const plan = {
    id: 'p1', name: '体验', isPublic: true, durationDays: 30, trafficLimitBytes: BigInt(1000),
    nodeMatchMode: 'ALL', nodeTagsJson: '[]', nodeIdsJson: '[]', template: null
  };
  const subscription = {
    id: 's1', userId: 'u1', planId: 'p1', status: 'ACTIVE', trafficLimitBytes: BigInt(1000), trafficUsedBytes: BigInt(0),
    startedAt: new Date(), expireAt: new Date(Date.now() + 86400000), subscriptionToken: 'token', canceledAt: null,
    createdAt: new Date(), updatedAt: new Date(), plan, user: { id: 'u1', email: 'u@example.com', uuid: 'uuid', password: null, isActive: true, expireAt: null, trafficLimitBytes: BigInt(1000), trafficUsedBytes: BigInt(0) }
  };
  const tx = {
    subscription: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    user: { update: jest.fn() }
  };
  const prisma = {
    plan: { findUnique: jest.fn() },
    subscription: { findUnique: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn(), update: jest.fn() },
    node: { findMany: jest.fn() },
    $transaction: jest.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx))
  };
  const gateway = { pushConfigToAll: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [SubscriptionService, { provide: PrismaService, useValue: prisma }, { provide: AgentGatewayService, useValue: gateway }]
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
});
