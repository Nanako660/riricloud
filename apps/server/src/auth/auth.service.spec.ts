import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { AgentGatewayService } from '../agent-gateway/agent-gateway.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../system/settings.service';

describe('AuthService', () => {
  let service: AuthService;
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn()
    }
  };
  const agentGateway = { pushConfigToAll: jest.fn() };
  const settingsService = { getSettings: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { sign: jest.fn().mockReturnValue('token') } },
        { provide: AgentGatewayService, useValue: agentGateway },
        { provide: SettingsService, useValue: settingsService }
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
          trafficLimitBytes: BigInt(107374182400)
        })
      });
      expect(agentGateway.pushConfigToAll).toHaveBeenCalledTimes(1);
    });
  });
});
