import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../system/settings.service';
import { MailService } from '../mail/mail.service';
import { CaptchaService } from '../captcha/captcha.service';
import { VerificationService } from './verification.service';

describe('VerificationService', () => {
  let service: VerificationService;
  const prisma = {
    user: { findUnique: jest.fn() },
    verificationCode: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() }
  };
  const settingsService = { getSettings: jest.fn() };
  const mailService = { sendVerificationCode: jest.fn() };
  const captchaService = { verifyCaptcha: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        VerificationService,
        { provide: PrismaService, useValue: prisma },
        { provide: SettingsService, useValue: settingsService },
        { provide: MailService, useValue: mailService },
        { provide: CaptchaService, useValue: captchaService }
      ]
    }).compile();
    service = moduleRef.get(VerificationService);
  });

  beforeEach(() => {
    settingsService.getSettings.mockResolvedValue({ emailVerificationEnabled: true, captchaMode: 'OFF' });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.verificationCode.findFirst.mockResolvedValue(null);
    prisma.verificationCode.deleteMany.mockResolvedValue({ count: 0 });
    prisma.verificationCode.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'code-1', ...data }));
    prisma.verificationCode.delete.mockResolvedValue({});
    mailService.sendVerificationCode.mockResolvedValue({ messageId: 'mail-1' });
    jest.clearAllMocks();
    settingsService.getSettings.mockResolvedValue({ emailVerificationEnabled: true, captchaMode: 'OFF' });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.verificationCode.findFirst.mockResolvedValue(null);
    prisma.verificationCode.deleteMany.mockResolvedValue({ count: 0 });
    prisma.verificationCode.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'code-1', ...data }));
    prisma.verificationCode.delete.mockResolvedValue({});
    mailService.sendVerificationCode.mockResolvedValue({ messageId: 'mail-1' });
  });

  it('生成六位验证码并设置五分钟有效期', async () => {
    const before = Date.now();
    const result = await service.sendCode({ email: 'User@Example.com', action: 'REGISTER' });
    const data = prisma.verificationCode.create.mock.calls[0][0].data as { code: string; expiresAt: Date };
    expect(data.code).toMatch(/^\d{6}$/);
    expect(data.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 4 * 60 * 1000);
    expect(data.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 5 * 60 * 1000);
    expect(result).toMatchObject({ sent: true, cooldownSeconds: 60 });
    expect(mailService.sendVerificationCode).toHaveBeenCalledWith('user@example.com', data.code, 'REGISTER');
  });

  it('同邮箱同一行为六十秒内拒绝重复发送', async () => {
    prisma.verificationCode.findFirst.mockResolvedValue({ id: 'recent', createdAt: new Date(), expiresAt: new Date(Date.now() + 1000) });
    await expect(service.sendCode({ email: 'user@example.com', action: 'REGISTER' })).rejects.toBeInstanceOf(HttpException);
    await expect(service.sendCode({ email: 'user@example.com', action: 'REGISTER' })).rejects.toThrow('60 秒');
  });

  it('第五次错误验证码触发熔断，过期验证码拒绝', async () => {
    prisma.verificationCode.findFirst.mockResolvedValue({ id: 'code-1', code: '123456', attempts: 4, expiresAt: new Date(Date.now() + 60_000) });
    prisma.verificationCode.update.mockResolvedValue({});
    await expect(service.verifyCode('user@example.com', 'REGISTER', '000000')).rejects.toThrow('错误次数过多');
    expect(prisma.verificationCode.update).toHaveBeenCalledWith({ where: { id: 'code-1' }, data: { attempts: 5 } });

    prisma.verificationCode.findFirst.mockResolvedValue({ id: 'expired', code: '123456', attempts: 0, expiresAt: new Date(Date.now() - 1000) });
    await expect(service.verifyCode('user@example.com', 'REGISTER', '123456')).rejects.toThrow('已过期');
  });
});
