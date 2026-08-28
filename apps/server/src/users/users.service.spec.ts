import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    node: { count: jest.fn(), findMany: jest.fn() }
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }]
    }).compile();
    service = moduleRef.get(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  const seededUser = {
    id: 'u1',
    email: 'demo@riricloud.local',
    isActive: true,
    expireAt: null,
    trafficLimitBytes: BigInt(107374182400),
    trafficUsedBytes: BigInt(0),
    subscriptionToken: 'tok'
  };

  describe('getDashboard', () => {
    it('流量字段序列化为 Number，响应可被 JSON.stringify（BigInt 修复回归）', async () => {
      prisma.user.findUnique.mockResolvedValue(seededUser);
      prisma.node.count.mockResolvedValue(2);
      const dashboard = await service.getDashboard('u1');
      expect(() => JSON.stringify(dashboard)).not.toThrow();
      expect(dashboard.trafficLimitBytes).toBe(107374182400);
      expect(dashboard.trafficUsedBytes).toBe(0);
    });

    it('用户不存在时抛出 UnauthorizedException', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getDashboard('nope')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('resetSubscriptionToken', () => {
    it('返回与旧值不同的新 token 并写库', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...seededUser, subscriptionToken: 'old-token' });
      const token = await service.resetSubscriptionToken('u1');
      expect(token).not.toBe('old-token');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { subscriptionToken: token }
      });
    });

    it('用户不存在时抛出 UnauthorizedException', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.resetSubscriptionToken('nope')).rejects.toThrow(UnauthorizedException);
    });
  });
});
