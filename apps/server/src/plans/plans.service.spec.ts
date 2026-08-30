import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { PlansService } from './plans.service';

describe('PlansService', () => {
  let service: PlansService;
  const prisma = {
    plan: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn(), update: jest.fn(), delete: jest.fn() },
    subscriptionTemplate: { findUnique: jest.fn() },
    node: { findMany: jest.fn() },
    $transaction: jest.fn()
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PlansService, { provide: PrismaService, useValue: prisma }]
    }).compile();
    service = moduleRef.get(PlansService);
  });

  afterEach(() => jest.clearAllMocks());

  it('按标签匹配在线节点并解析节点标签', async () => {
    prisma.plan.findUnique.mockResolvedValue({
      id: 'p1', nodeMatchMode: 'TAGS', nodeTagsJson: '["vip"]', nodeIdsJson: '[]'
    });
    prisma.node.findMany.mockResolvedValue([
      { id: 'n1', name: 'VIP', serverHost: '1.1.1.1', level: 2, tagsJson: '["vip","hk"]', inbounds: [] },
      { id: 'n2', name: 'Basic', serverHost: '2.2.2.2', level: 1, tagsJson: '["free"]', inbounds: [] }
    ]);
    await expect(service.getAvailableNodes('p1')).resolves.toEqual([
      { id: 'n1', name: 'VIP', serverHost: '1.1.1.1', level: 2, tags: ['vip', 'hk'], inbounds: [] }
    ]);
  });

  it('创建套餐时将字节数和匹配列表持久化为结构化字段', async () => {
    prisma.subscriptionTemplate.findUnique.mockResolvedValue(null);
    prisma.plan.create.mockResolvedValue({
      id: 'p1', name: '基础', description: null, price: 0, durationDays: 30,
      trafficLimitBytes: BigInt(1024), nodeMatchMode: 'ALL', nodeTagsJson: '[]', nodeIdsJson: '[]',
      templateId: null, isPublic: true, sortOrder: 0
    });
    await service.create({ name: '基础', durationDays: 30, trafficLimitBytes: 1024 });
    expect(prisma.plan.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ trafficLimitBytes: BigInt(1024), nodeTagsJson: '[]', nodeIdsJson: '[]' })
    }));
  });
});
