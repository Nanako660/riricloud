import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { AgentGatewayService } from '../agent-gateway/agent-gateway.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../system/settings.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { VerificationService } from '../verification/verification.service';
import { WalletService } from '../wallet/wallet.service';

describe('AuthService', () => {
  let service: AuthService;
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    }
  };
  const agentGateway = { pushConfigToAll: jest.fn() };
  const settingsService = { getSettings: jest.fn() };
  const subscriptionService = { subscribe: jest.fn() };
  const walletService = { adjustBalance: jest.fn() };
  const verificationService = { verifyCode: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { sign: jest.fn().mockReturnValue('token') } },
        { provide: AgentGatewayService, useValue: agentGateway },
        { provide: SettingsService, useValue: settingsService },
        { provide: SubscriptionService, useValue: subscriptionService },
        { provide: WalletService, useValue: walletService },
        { provide: VerificationService, useValue: verificationService }
      ]
    }).compile();
    service = moduleRef.get(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  const activeAdmin = {
    id: 'u1',
    email: 'admin@riricloud.local',
    role: 'ADMIN',
    passwordHash: '',
    isActive: true
  };

  describe('login', () => {
    it('凭据正确时返回 accessToken', async () => {
      activeAdmin.passwordHash = await bcrypt.hash('riri-admin-demo', 10);
      prisma.user.findUnique.mockResolvedValue(activeAdmin);
      const result = await service.login({ email: 'admin@riricloud.local', password: 'riri-admin-demo' });
      expect(result).toEqual({ accessToken: 'token' });
    });

    it('密码错误时抛出 UnauthorizedException', async () => {
      prisma.user.findUnique.mockResolvedValue(activeAdmin);
      await expect(
        service.login({ email: 'admin@riricloud.local', password: 'wrong-password' })
      ).rejects.toThrow(UnauthorizedException);
    });

    it('账号被禁用时抛出 UnauthorizedException', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...activeAdmin, isActive: false });
      await expect(
        service.login({ email: 'admin@riricloud.local', password: 'riri-admin-demo' })
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getMe', () => {
    it('流量字段序列化为 Number，响应可被 JSON.stringify（BigInt 修复回归）', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'admin@riricloud.local',
        role: 'ADMIN',
        trafficLimitBytes: BigInt(107374182400),
        trafficUsedBytes: BigInt(2147483648),
        expireAt: null,
        subscriptionToken: 'tok',
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00Z')
      });
      const me = await service.getMe('u1');
      // Express res.json 内部调用 JSON.stringify，BigInt 会直接抛错
      expect(() => JSON.stringify(me)).not.toThrow();
      expect(me.trafficLimitBytes).toBe(107374182400);
      expect(me.trafficUsedBytes).toBe(2147483648);
    });
  });

  describe('register', () => {
    const enabledSettings = {
      siteName: 'RiriCloud',
      registrationEnabled: true,
      defaultTrafficLimitBytes: 107374182400
    };

    it('注册开关关闭时抛出 ForbiddenException', async () => {
      settingsService.getSettings.mockResolvedValue({ ...enabledSettings, registrationEnabled: false });
      await expect(
        service.register({ email: 'new@example.com', password: 'password123' })
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('邮箱已存在时抛出 ConflictException', async () => {
      settingsService.getSettings.mockResolvedValue(enabledSettings);
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      await expect(
        service.register({ email: 'admin@riricloud.local', password: 'password123' })
      ).rejects.toThrow(ConflictException);
    });

    it('注册成功创建 USER 角色默认配额用户并触发全节点推送', async () => {
      settingsService.getSettings.mockResolvedValue(enabledSettings);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(async ({ data }) => ({
        id: 'u2',
        email: data.email,
        role: data.role,
        trafficLimitBytes: data.trafficLimitBytes
      }));
      const result = await service.register({ email: 'new@example.com', password: 'password123' });
      expect(result).toEqual({ accessToken: 'token' });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'new@example.com',
          role: 'USER',
          trafficLimitBytes: BigInt(0)
        })
      });
      expect(agentGateway.pushConfigToAll).toHaveBeenCalledTimes(1);
    });

    it('按系统设置限制密码最小长度', async () => {
      settingsService.getSettings.mockResolvedValue({ ...enabledSettings, passwordMinLength: 12 });
      await expect(service.register({ email: 'short@example.com', password: 'password1' })).rejects.toThrow('密码至少 12 位');
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('按系统设置执行邮箱域名白名单和黑名单过滤', async () => {
      settingsService.getSettings.mockResolvedValue({ ...enabledSettings, emailDomainMode: 'whitelist', emailDomainList: ['example.com'] });
      await expect(service.register({ email: 'new@blocked.com', password: 'password123' })).rejects.toThrow('不在允许注册范围');
      settingsService.getSettings.mockResolvedValue({ ...enabledSettings, emailDomainMode: 'blacklist', emailDomainList: ['blocked.com'] });
      await expect(service.register({ email: 'new@blocked.com', password: 'password123' })).rejects.toThrow('已被禁止注册');
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('配置默认套餐时注册后自动激活订阅', async () => {
      settingsService.getSettings.mockResolvedValue({ ...enabledSettings, defaultPlanId: 'plan-1' });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'u-default-plan', email: 'plan@example.com', role: 'USER' });
      subscriptionService.subscribe.mockResolvedValue({ id: 'sub-1' });
      await service.register({ email: 'plan@example.com', password: 'password123' });
      expect(subscriptionService.subscribe).toHaveBeenCalledWith('u-default-plan', 'plan-1');
      expect(agentGateway.pushConfigToAll).not.toHaveBeenCalled();
    });

    it('配置初始余额时写入 SYSTEM_GIFT 流水', async () => {
      settingsService.getSettings.mockResolvedValue({ ...enabledSettings, defaultBalance: 2500 });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'u-gift', email: 'gift@example.com', role: 'USER' });
      await service.register({ email: 'gift@example.com', password: 'password123' });
      expect(walletService.adjustBalance).toHaveBeenCalledWith('u-gift', 2500, 'SYSTEM_GIFT', '新用户注册赠金');
    });
  });

  describe('resetPassword', () => {
    it('邮箱不存在时抛出 BadRequestException', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.resetPassword({
        email: 'notfound@example.com',
        code: '123456',
        newPassword: 'password123'
      })).rejects.toThrow('该邮箱尚未注册');
    });

    it('新密码长度小于系统设置时抛出 BadRequestException', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'test@example.com', emailVerifiedAt: null });
      settingsService.getSettings.mockResolvedValue({ passwordMinLength: 10 });
      await expect(service.resetPassword({
        email: 'test@example.com',
        code: '123456',
        newPassword: 'short'
      })).rejects.toThrow('密码至少 10 位');
    });

    it('重置密码成功后更新密码散列并自动补全 emailVerifiedAt，并向在线节点推送配置', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'test@example.com', emailVerifiedAt: null });
      settingsService.getSettings.mockResolvedValue({ passwordMinLength: 8 });
      verificationService.verifyCode.mockResolvedValue(undefined);
      prisma.user.update.mockResolvedValue({});

      const result = await service.resetPassword({
        email: 'test@example.com',
        code: '123456',
        newPassword: 'new-password-123'
      });

      expect(result).toEqual({ success: true, message: '密码重置成功' });
      expect(verificationService.verifyCode).toHaveBeenCalledWith('test@example.com', 'RESET_PASSWORD', '123456');
      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'u1' },
        data: expect.objectContaining({
          emailVerifiedAt: expect.any(Date)
        })
      }));
      expect(agentGateway.pushConfigToAll).toHaveBeenCalled();
    });
  });
});
