import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { AgentGatewayService } from '../agent-gateway/agent-gateway.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../system/settings.service';
import { UsersService } from './users.service';
import { WalletService } from '../wallet/wallet.service';

describe('UsersService', () => {
  let service: UsersService;
  const prisma = {
    $transaction: jest.fn(),
    user: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn(), delete: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    node: { count: jest.fn(), findMany: jest.fn() },
    plan: { findUnique: jest.fn(), findFirst: jest.fn() },
    subscription: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() }
  };
  const agentGateway = { pushConfigToAll: jest.fn() };
  const settingsService = { getSettings: jest.fn(), getDefaultQuota: jest.fn() };
  const walletService = { adjustBalance: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: AgentGatewayService, useValue: agentGateway },
        { provide: SettingsService, useValue: settingsService },
        { provide: WalletService, useValue: walletService }
      ]
    }).compile();
    service = moduleRef.get(UsersService);
  });

  afterEach(() => jest.resetAllMocks());

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
        [{
          ...seededUser,
          createdAt: new Date(),
          subscription: {
            id: 's1',
            status: 'ACTIVE',
            trafficLimitBytes: BigInt(214748364800),
            trafficUsedBytes: BigInt(1073741824),
            startedAt: new Date(),
            expireAt: null,
            plan: { id: 'p1', name: '体验套餐' }
          }
        }],
        1
      ]);
      const result = await service.listUsers({
        page: 1,
        pageSize: 20,
        search: 'demo',
        isActive: false,
        subscriptionStatus: 'ACTIVE',
        planId: 'p1'
      });
      expect(result.total).toBe(1);
      expect(result.data[0].trafficLimitBytes).toBe(107374182400);
      expect(typeof result.data[0].trafficLimitBytes).toBe('number');
      expect(result.data[0].subscription).toMatchObject({
        status: 'ACTIVE',
        trafficLimitBytes: 214748364800,
        trafficUsedBytes: 1073741824,
        plan: { id: 'p1', name: '体验套餐' }
      });
      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          email: { contains: 'demo' },
          isActive: false,
          subscription: { is: { status: 'ACTIVE', planId: 'p1' } }
        }
      }));
    });
  });

  describe('createUser', () => {
    it('指定套餐时在同一事务创建用户与初始订阅', async () => {
      const now = new Date();
      const plan = {
        id: 'p1',
        name: '体验套餐',
        durationDays: 30,
        trafficLimitBytes: BigInt(214748364800),
        isPublic: true
      };
      const created = { ...seededUser, id: 'u2', email: 'new@riricloud.local', createdAt: now };
      const tx = {
        user: { create: jest.fn().mockResolvedValue(created) },
        subscription: { create: jest.fn().mockResolvedValue({ id: 's2' }) }
      };
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.plan.findUnique.mockResolvedValue(plan);
      settingsService.getDefaultQuota.mockResolvedValue(107374182400);
      prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));

      const result = await service.createUser({
        email: 'new@riricloud.local',
        password: 'strong-pass',
        planId: 'p1',
        expireAt: null
      });

      expect(result.email).toBe('new@riricloud.local');
      expect(tx.user.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          trafficLimitBytes: BigInt(214748364800),
          subscriptionToken: expect.any(String)
        })
      }));
      const subscriptionCall = tx.subscription.create.mock.calls[0][0];
      expect(subscriptionCall.data).toMatchObject({
        userId: 'u2',
        planId: 'p1',
        status: 'ACTIVE',
        trafficLimitBytes: BigInt(214748364800),
        trafficUsedBytes: BigInt(0),
        expireAt: null
      });
      expect(subscriptionCall.data.subscriptionToken).toBe(
        tx.user.create.mock.calls[0][0].data.subscriptionToken
      );
    });

    it('未指定套餐时自动选择体验套餐并使用套餐配额与周期', async () => {
      const plan = {
        id: 'p1',
        name: '体验套餐',
        durationDays: 30,
        trafficLimitBytes: BigInt(214748364800),
        isPublic: true
      };
      const tx = {
        user: { create: jest.fn().mockResolvedValue({ ...seededUser, id: 'u3' }) },
        subscription: { create: jest.fn().mockResolvedValue({ id: 's3' }) }
      };
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.plan.findFirst.mockResolvedValue(plan);
      settingsService.getDefaultQuota.mockResolvedValue(107374182400);
      prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));

      await service.createUser({ email: 'default@riricloud.local', password: 'strong-pass' });

      expect(prisma.plan.findFirst).toHaveBeenCalledWith({ where: { name: '体验套餐' } });
      expect(tx.subscription.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ planId: 'p1', trafficLimitBytes: BigInt(214748364800) })
      }));
    });

    it('明确传 null 时创建无套餐用户', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ ...seededUser, id: 'u4', email: 'unassigned@riricloud.local' });
      settingsService.getDefaultQuota.mockResolvedValue(107374182400);

      const result = await service.createUser({
        email: 'unassigned@riricloud.local',
        password: 'strong-pass',
        planId: null
      });

      expect(result.email).toBe('unassigned@riricloud.local');
      expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ trafficLimitBytes: BigInt(107374182400) })
      }));
      expect(prisma.subscription.create).not.toHaveBeenCalled();
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

  describe('个人安全与余额', () => {
    it('旧密码正确时可以修改登录密码', async () => {
      prisma.user.findUnique.mockResolvedValue({ passwordHash: await bcrypt.hash('old-password', 10) });
      prisma.user.update.mockResolvedValue({});
      await expect(service.changePassword('u1', { oldPassword: 'old-password', newPassword: 'new-password' })).resolves.toEqual({ updated: true });
      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1' }, data: { passwordHash: expect.any(String) } }));
    });

    it('重置 UUID 后向在线节点推送配置', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      prisma.user.update.mockResolvedValue({});
      const result = await service.resetUuid('u1');
      expect(result.uuid).toEqual(expect.any(String));
      expect(agentGateway.pushConfigToAll).toHaveBeenCalledTimes(1);
    });

    it('管理员调账复用钱包服务并返回新余额', async () => {
      walletService.adjustBalance.mockResolvedValue({ balance: 2500, transaction: { id: 'bt1' } });
      await expect(service.adjustBalance('u1', 500, '活动补发')).resolves.toEqual({ userId: 'u1', balance: 2500, transaction: { id: 'bt1' } });
      expect(walletService.adjustBalance).toHaveBeenCalledWith('u1', 500, 'ADMIN_ADJUST', '活动补发');
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
