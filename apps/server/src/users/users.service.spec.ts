import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AgentGatewayService } from '../agent-gateway/agent-gateway.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../system/settings.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  const prisma = {
    $transaction: jest.fn(),
    user: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn(), delete: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    node: { count: jest.fn(), findMany: jest.fn() }
  };
  const agentGateway = { pushConfigToAll: jest.fn() };
  const settingsService = { getSettings: jest.fn(), getDefaultQuota: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: AgentGatewayService, useValue: agentGateway },
        { provide: SettingsService, useValue: settingsService }
      ]
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

  describe('listUsers', () => {
    it('分页查询返回统一结构并做 BigInt 边界转换', async () => {
      prisma.$transaction.mockResolvedValue([
        [{ ...seededUser, createdAt: new Date() }],
        1
      ]);
      const result = await service.listUsers({ page: 1, pageSize: 20, search: 'demo' });
      expect(result.total).toBe(1);
      expect(result.data[0].trafficLimitBytes).toBe(107374182400);
      expect(typeof result.data[0].trafficLimitBytes).toBe('number');
    });
  });

  describe('updateUser', () => {
    it('管理员不能修改自己的角色（防锁死）', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...seededUser, role: 'ADMIN' });
      await expect(
        service.updateUser('u1', { role: 'USER' }, 'u1')
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('配额更新触发全节点推送', async () => {
      prisma.user.findUnique.mockResolvedValue(seededUser);
      prisma.user.update.mockResolvedValue({ ...seededUser, trafficLimitBytes: BigInt(214748364800) });
      const result = await service.updateUser('u1', { trafficLimitBytes: 214748364800 }, 'admin-1');
      expect(result.trafficLimitBytes).toBe(214748364800);
      expect(agentGateway.pushConfigToAll).toHaveBeenCalledTimes(1);
    });

    it('expireAt 传 null 表示永久', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...seededUser, expireAt: new Date() });
      prisma.user.update.mockResolvedValue({ ...seededUser, expireAt: null });
      await service.updateUser('u1', { expireAt: null }, 'admin-1');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { expireAt: null },
        select: expect.anything()
      });
    });

    it('用户不存在抛出 NotFoundException', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.updateUser('nope', {}, 'admin-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteUser', () => {
    it('不能删除自己', async () => {
      await expect(service.deleteUser('u1', 'u1')).rejects.toThrow(ForbiddenException);
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('删除成功并触发全节点推送', async () => {
      prisma.user.findUnique.mockResolvedValue(seededUser);
      prisma.user.delete.mockResolvedValue(seededUser);
      const result = await service.deleteUser('u1', 'admin-1');
      expect(result.deleted).toBe(true);
      expect(agentGateway.pushConfigToAll).toHaveBeenCalledTimes(1);
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
