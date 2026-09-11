import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { PlansService } from './plans.service';

describe('PlansService', () => {
  let service: PlansService;
  const prisma = {
    plan: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn(), update: jest.fn(), delete: jest.fn() },
    subscriptionTemplate: { findUnique: jest.fn() },
    $transaction: jest.fn()
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PlansService, { provide: PrismaService, useValue: prisma }]
    }).compile();
    service = moduleRef.get(PlansService);
  });

  afterEach(() => jest.clearAllMocks());

  it('按标签匹配在线线路并解析线路标签', async () => {
    prisma.plan.findUnique.mockResolvedValue({
      id: 'p1', lineMatchMode: 'TAGS', lineTagsJson: '["vip"]', lineIdsJson: '[]'
    });
    const linesService = {
      getAvailableForPlan: jest.fn().mockResolvedValue([
        { id: 'l1', name: 'VIP 线路', tags: ['vip', 'hk'] }
      ])
    };
    service = new PlansService(prisma as never, linesService as never);
    await expect(service.getAvailableNodes('p1')).resolves.toEqual([
      { id: 'l1', name: 'VIP 线路', tags: ['vip', 'hk'] }
    ]);
    expect(linesService.getAvailableForPlan).toHaveBeenCalledWith(expect.objectContaining({ lineMatchMode: 'TAGS' }));
  });

  it('创建套餐时将字节数和匹配列表持久化为结构化字段', async () => {
    prisma.subscriptionTemplate.findUnique.mockResolvedValue(null);
    prisma.plan.create.mockResolvedValue({
      id: 'p1', name: '基础', description: null, price: 0, durationDays: 30,
      trafficLimitBytes: BigInt(1024), lineMatchMode: 'ALL', lineTagsJson: '[]', lineIdsJson: '[]',
      templateId: null, isPublic: true, sortOrder: 0
    });
    await service.create({ name: '基础', durationDays: 30, trafficLimitBytes: 1024 });
      expect(prisma.plan.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ trafficLimitBytes: BigInt(1024), lineTagsJson: '[]', lineIdsJson: '[]' })
    }));
  });

  it('以元接收价格并按分写入数据库', async () => {
    prisma.subscriptionTemplate.findUnique.mockResolvedValue(null);
    prisma.plan.create.mockResolvedValue({
      id: 'p2', name: '付费', description: null, price: 1234, durationDays: 30,
      trafficLimitBytes: BigInt(1024), lineMatchMode: 'ALL', lineTagsJson: '[]', lineIdsJson: '[]',
      templateId: null, isPublic: true, sortOrder: 0
    });
    await service.create({ name: '付费', price: 12.34, durationDays: 30, trafficLimitBytes: 1024 });
    expect(prisma.plan.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ price: 1234 }) }));
  });

  it('创建套餐时支持保存并序列化 badgeText, isFeatured 与 features', async () => {
    prisma.subscriptionTemplate.findUnique.mockResolvedValue(null);
    prisma.plan.create.mockResolvedValue({
      id: 'p3', name: '尊享套餐', description: '旗舰', price: 9900, durationDays: 30,
      trafficLimitBytes: BigInt(1024), lineMatchMode: 'ALL', lineTagsJson: '[]', lineIdsJson: '[]',
      templateId: null, isPublic: true, sortOrder: 0,
      badgeText: 'HOT', isFeatured: true, featuresJson: '["专线接入","流媒体解锁"]'
    });
    const result = await service.create({
      name: '尊享套餐',
      description: '旗舰',
      price: 99,
      durationDays: 30,
      trafficLimitBytes: 1024,
      badgeText: 'HOT',
      isFeatured: true,
      features: ['专线接入', '流媒体解锁']
    });
    expect(prisma.plan.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        badgeText: 'HOT',
        isFeatured: true,
        featuresJson: '["专线接入","流媒体解锁"]'
      })
    }));
    expect(result).toMatchObject({
      badgeText: 'HOT',
      isFeatured: true,
      features: ['专线接入', '流媒体解锁']
    });
  });

  it('创建套餐时支持保存并反序列化 cardConfig 动态配置', async () => {
    prisma.subscriptionTemplate.findUnique.mockResolvedValue(null);
    prisma.plan.create.mockResolvedValue({
      id: 'p4', name: '流光旗舰版', description: '炫彩流光', price: 6800, durationDays: 90,
      trafficLimitBytes: BigInt(2048), lineMatchMode: 'ALL', lineTagsJson: '[]', lineIdsJson: '[]',
      templateId: null, isPublic: true, sortOrder: 0,
      badgeText: 'HOT', isFeatured: true, featuresJson: '[]',
      cardConfigJson: JSON.stringify({
        themeColor: 'amber',
        icon: 'Crown',
        animationEffect: 'beam_pulse',
        beamColor: 'rainbow',
        shimmerButton: true,
        originalPrice: 88,
        discountText: '立省 20 元'
      })
    });
    const result = await service.create({
      name: '流光旗舰版',
      price: 68,
      durationDays: 90,
      trafficLimitBytes: 2048,
      cardConfig: {
        themeColor: 'amber',
        icon: 'Crown',
        animationEffect: 'beam_pulse',
        beamColor: 'rainbow',
        shimmerButton: true,
        originalPrice: 88,
        discountText: '立省 20 元'
      }
    });
    expect(prisma.plan.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        cardConfigJson: expect.stringContaining('"themeColor":"amber"')
      })
    }));
    expect(result).toMatchObject({
      cardConfig: {
        themeColor: 'amber',
        icon: 'Crown',
        animationEffect: 'beam_pulse',
        beamColor: 'rainbow',
        shimmerButton: true,
        originalPrice: 88,
        discountText: '立省 20 元'
      }
    });
  });
});
