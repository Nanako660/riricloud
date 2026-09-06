import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CaptchaService } from './captcha.service';
import { SettingsService } from '../system/settings.service';
import { RateLimitService } from '../common/rate-limit.service';
import { PrismaService } from '../prisma/prisma.service';
import { hashAuthValue } from '../common/auth-security';

describe('CaptchaService', () => {
  let service: CaptchaService;
  const settingsService = { getSettings: jest.fn() };
  const prisma = {
    captchaChallenge: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn() }
  };
  const originalSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret-for-captcha-signing-0123456789';
    const moduleRef = await Test.createTestingModule({
      providers: [CaptchaService, { provide: PrismaService, useValue: prisma }, { provide: SettingsService, useValue: settingsService }, RateLimitService]
    }).compile();
    service = moduleRef.get(CaptchaService);
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  afterEach(() => jest.clearAllMocks());

  it('生成签名本地验证码并在成功后拒绝重放', async () => {
    settingsService.getSettings.mockResolvedValue({ captchaMode: 'LOCAL' });
    prisma.captchaChallenge.create.mockResolvedValue({ id: 'captcha-1' });
    prisma.captchaChallenge.deleteMany.mockResolvedValue({ count: 0 });
    const challenge = await service.createLocalChallenge('127.0.0.1');
    expect(challenge.svg).toContain('#f8fafc');
    expect(challenge.svg).toMatch(/fill="#[0-9a-f]{6}"/i);
    expect(challenge.captchaToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(challenge.captchaToken).not.toContain('.');
    const stored = prisma.captchaChallenge.create.mock.calls[0][0].data as { answerHash: string; tokenHash: string; ipHash: string };
    expect(stored.answerHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.ipHash).toMatch(/^[a-f0-9]{64}$/);
    prisma.captchaChallenge.findUnique
      .mockResolvedValueOnce({ id: 'captcha-1', tokenHash: stored.tokenHash, answerHash: hashAuthValue('captcha-answer', '3'), ipHash: stored.ipHash, attempts: 0, consumedAt: null, expiresAt: new Date(Date.now() + 60_000) });
    prisma.captchaChallenge.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.verifyCaptcha({ captchaToken: challenge.captchaToken, captchaAnswer: '3', remoteIp: '127.0.0.1' })).resolves.toBeUndefined();
    prisma.captchaChallenge.findUnique.mockResolvedValue({ id: 'captcha-1', tokenHash: stored.tokenHash, answerHash: stored.answerHash, ipHash: stored.ipHash, attempts: 0, consumedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) });
    await expect(service.verifyCaptcha({ captchaToken: challenge.captchaToken, captchaAnswer: '3', remoteIp: '127.0.0.1' })).rejects.toThrow('已使用');
  });

  it('拒绝错误的本地图形验证码', async () => {
    settingsService.getSettings.mockResolvedValue({ captchaMode: 'LOCAL' });
    prisma.captchaChallenge.create.mockResolvedValue({ id: 'captcha-2' });
    prisma.captchaChallenge.deleteMany.mockResolvedValue({ count: 0 });
    const challenge = await service.createLocalChallenge('127.0.0.2');
    prisma.captchaChallenge.findUnique
      .mockResolvedValueOnce({ id: 'captcha-2', answerHash: hashAuthValue('captcha-answer', '3'), ipHash: null, attempts: 0, consumedAt: null, expiresAt: new Date(Date.now() + 60_000) })
      .mockResolvedValueOnce({ id: 'captcha-2', attempts: 1 });
    prisma.captchaChallenge.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.verifyCaptcha({ captchaToken: challenge.captchaToken, captchaAnswer: 'wrong', remoteIp: '127.0.0.2' })).rejects.toThrow(BadRequestException);
  });

  it('向 Turnstile 官方校验接口提交 token', async () => {
    settingsService.getSettings.mockResolvedValue({ captchaMode: 'TURNSTILE', turnstileSecretKey: 'secret' });
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, action: 'register' }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(service.verifyCaptcha({ turnstileToken: 'token', remoteIp: '127.0.0.1', action: 'register' })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('https://challenges.cloudflare.com/turnstile/v0/siteverify', expect.objectContaining({ method: 'POST' }));
  });

  it('拒绝 action 或 hostname 不匹配的 Turnstile token', async () => {
    settingsService.getSettings.mockResolvedValue({ captchaMode: 'TURNSTILE', turnstileSecretKey: 'secret', publicBaseUrl: 'https://cloud.example.com' });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, action: 'reset-password', hostname: 'evil.example.com' }) }) as unknown as typeof fetch;

    await expect(service.verifyCaptcha({ turnstileToken: 'token', action: 'register' })).rejects.toThrow('人机验证未通过');
  });

  it('Turnstile 失败时拒绝请求', async () => {
    settingsService.getSettings.mockResolvedValue({ captchaMode: 'TURNSTILE', turnstileSecretKey: 'secret' });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: false }) }) as unknown as typeof fetch;
    await expect(service.verifyCaptcha({ turnstileToken: 'token' })).rejects.toThrow('人机验证未通过');
  });
});
