import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CaptchaService } from './captcha.service';
import { SettingsService } from '../system/settings.service';

describe('CaptchaService', () => {
  let service: CaptchaService;
  const settingsService = { getSettings: jest.fn() };
  const originalSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret-for-captcha-signing-0123456789';
    const moduleRef = await Test.createTestingModule({
      providers: [CaptchaService, { provide: SettingsService, useValue: settingsService }]
    }).compile();
    service = moduleRef.get(CaptchaService);
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  afterEach(() => jest.clearAllMocks());

  it('生成签名本地验证码并在成功后拒绝重放', async () => {
    settingsService.getSettings.mockResolvedValue({ captchaMode: 'LOCAL' });
    const challenge = service.createLocalChallenge();
    expect(challenge.svg).toContain('#f8fafc');
    expect(challenge.svg).toMatch(/fill="#[0-9a-f]{6}"/i);
    const payload = challenge.captchaToken.split('.')[0];
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { answer: string };

    await expect(service.verifyCaptcha({ captchaToken: challenge.captchaToken, captchaAnswer: parsed.answer })).resolves.toBeUndefined();
    await expect(service.verifyCaptcha({ captchaToken: challenge.captchaToken, captchaAnswer: parsed.answer })).rejects.toThrow('已使用');
  });

  it('拒绝错误的本地图形验证码', async () => {
    settingsService.getSettings.mockResolvedValue({ captchaMode: 'LOCAL' });
    const challenge = service.createLocalChallenge();
    await expect(service.verifyCaptcha({ captchaToken: challenge.captchaToken, captchaAnswer: 'wrong' })).rejects.toThrow(BadRequestException);
  });

  it('向 Turnstile 官方校验接口提交 token', async () => {
    settingsService.getSettings.mockResolvedValue({ captchaMode: 'TURNSTILE', turnstileSecretKey: 'secret' });
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(service.verifyCaptcha({ turnstileToken: 'token', remoteIp: '127.0.0.1' })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('https://challenges.cloudflare.com/turnstile/v0/siteverify', expect.objectContaining({ method: 'POST' }));
  });

  it('Turnstile 失败时拒绝请求', async () => {
    settingsService.getSettings.mockResolvedValue({ captchaMode: 'TURNSTILE', turnstileSecretKey: 'secret' });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: false }) }) as unknown as typeof fetch;
    await expect(service.verifyCaptcha({ turnstileToken: 'token' })).rejects.toThrow('人机验证未通过');
  });
});
