import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionService } from './subscription.service';

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  const prisma = {
    user: { findUnique: jest.fn() },
    node: { findMany: jest.fn() }
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        { provide: PrismaService, useValue: prisma }
      ]
    }).compile();
    service = moduleRef.get(SubscriptionService);
  });

  afterEach(() => jest.clearAllMocks());

  const activeUser = {
    id: 'u1',
    subscriptionToken: 'tok-1',
    uuid: '11111111-2222-3333-4444-555555555555',
    isActive: true,
    expireAt: null,
    trafficLimitBytes: BigInt(107374182400),
    trafficUsedBytes: BigInt(0)
  };

  const onlineNode = {
    id: 'n1',
    name: '东京节点 01',
    serverHost: '203.0.113.10',
    serverPort: 443,
    protocol: 'VLESS_REALITY',
    status: 'ONLINE',
    isPublic: true,
    configPayload: JSON.stringify({
      serverNames: ['www.apple.com'],
      publicKey: 'pbk-test',
      shortIds: ['0123456789abcdef']
    })
  };

  it('有效用户返回 Base64 编码的 vless URI 列表与流量头', async () => {
    prisma.user.findUnique.mockResolvedValue(activeUser);
    prisma.node.findMany.mockResolvedValue([onlineNode]);
    const result = await service.getSubscription('tok-1');
    const decoded = Buffer.from(result.body, 'base64').toString('utf8');
    expect(decoded).toContain(
      `vless://11111111-2222-3333-4444-555555555555@203.0.113.10:443?`
    );
    expect(decoded).toContain('security=reality');
    expect(decoded).toContain('pbk=pbk-test');
    expect(result.userInfoHeader).toBe(
      'upload=0; download=0; total=107374182400; expire=0'
    );
  });

  it('过期用户抛出 ForbiddenException', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...activeUser,
      expireAt: new Date(Date.now() - 86400000)
    });
    await expect(service.getSubscription('tok-1')).rejects.toThrow(ForbiddenException);
  });

  it('超配额用户抛出 ForbiddenException', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...activeUser,
      trafficUsedBytes: BigInt(107374182400)
    });
    await expect(service.getSubscription('tok-1')).rejects.toThrow(ForbiddenException);
  });

  it('无效 token 抛出 NotFoundException', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getSubscription('nope')).rejects.toThrow(NotFoundException);
  });
});
