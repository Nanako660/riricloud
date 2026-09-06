import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as svgCaptcha from 'svg-captcha';
import { configuredHostname, hashAuthValue, safeEqual } from '../common/auth-security';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../system/settings.service';
import { RateLimitService } from '../common/rate-limit.service';
import { AuthAuditService } from '../common/auth-audit.service';

export interface CaptchaInput {
  captchaToken?: string;
  captchaAnswer?: string;
  turnstileToken?: string;
  remoteIp?: string;
  action?: string;
}

type CaptchaClient = { captchaChallenge: CaptchaChallengeStore };

const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type CaptchaChallengeRow = {
  id: string;
  tokenHash: string;
  answerHash: string;
  ipHash: string | null;
  attempts: number;
  consumedAt: Date | null;
  expiresAt: Date;
};

type CaptchaChallengeStore = {
  create: (args: Record<string, unknown>) => Promise<CaptchaChallengeRow>;
  findUnique: (args: Record<string, unknown>) => Promise<CaptchaChallengeRow | null>;
  updateMany: (args: Record<string, unknown>) => Promise<{ count: number }>;
  deleteMany: (args: Record<string, unknown>) => Promise<{ count: number }>;
};

@Injectable()
export class CaptchaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly rateLimitService: RateLimitService,
    @Optional() private readonly authAuditService?: AuthAuditService
  ) {}

  async createLocalChallenge(remoteIp = 'unknown') {
    if (!this.rateLimitService.consume(`captcha:ip:${remoteIp}`, 20, 60_000)) {
      this.authAuditService?.record('CAPTCHA_FAILURE', { reason: 'rate_limited', remoteIp });
      throw new BadRequestException('请求过于频繁，请稍后再试');
    }
    const captcha = svgCaptcha.createMathExpr({
      width: 160,
      height: 52,
      fontSize: 34,
      noise: 2,
      color: true,
      background: '#f8fafc',
      inverse: false,
      mathMin: 1,
      mathMax: 20
    });
    const expiresAt = new Date(Date.now() + CAPTCHA_TTL_MS);
    const token = randomBytes(32).toString('base64url');
    const normalizedIp = remoteIp.trim() || 'unknown';
    const store = this.store(this.prisma);
    await store.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    await store.create({
      data: {
        tokenHash: hashAuthValue('captcha-token', token),
        answerHash: hashAuthValue('captcha-answer', this.normalizeAnswer(captcha.text)),
        ipHash: normalizedIp === 'unknown' ? null : hashAuthValue('captcha-ip', normalizedIp),
        attempts: 0,
        expiresAt
      }
    });
    return { svg: captcha.data, captchaToken: token, expiresAt: expiresAt.toISOString() };
  }

  async verifyCaptcha(input: CaptchaInput, client: unknown = this.prisma): Promise<void> {
    try {
      await this.verifyCaptchaInternal(input, client);
      if ((await this.settingsService.getSettings()).captchaMode !== 'OFF') {
        this.authAuditService?.record('CAPTCHA_VERIFIED', { action: input.action, remoteIp: input.remoteIp || 'unknown' });
      }
    } catch (error) {
      this.authAuditService?.record('CAPTCHA_FAILURE', {
        action: input.action,
        remoteIp: input.remoteIp || 'unknown',
        reason: error instanceof Error ? error.message : 'verification_failed'
      });
      throw error;
    }
  }

  private async verifyCaptchaInternal(input: CaptchaInput, client: unknown): Promise<void> {
    if (!this.rateLimitService.consume(`captcha:verify:${input.remoteIp || 'unknown'}`, 30, 60_000)) {
      throw new BadRequestException('请求过于频繁，请稍后再试');
    }
    const settings = await this.settingsService.getSettings();
    const mode = settings.captchaMode ?? 'OFF';
    if (mode === 'OFF') return;
    if (mode === 'LOCAL') {
      await this.verifyLocal(input, client);
      return;
    }
    if (!input.turnstileToken || !settings.turnstileSecretKey) {
      throw new BadRequestException('请完成人机验证');
    }
    const body = new URLSearchParams({ secret: settings.turnstileSecretKey, response: input.turnstileToken });
    if (input.remoteIp) body.set('remoteip', input.remoteIp);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: controller.signal
      });
      const result = (await response.json()) as { success?: boolean; action?: string; hostname?: string; challenge_ts?: string };
      if (!response.ok || !result.success) throw new BadRequestException('人机验证未通过');
      if (!input.action || result.action !== this.turnstileAction(input.action)) {
        throw new BadRequestException('人机验证未通过');
      }
      const expectedHostname = configuredHostname(settings.publicBaseUrl || process.env.RIRICLOUD_PUBLIC_URL);
      if (expectedHostname && result.hostname?.toLowerCase() !== expectedHostname) {
        throw new BadRequestException('人机验证未通过');
      }
      if (result.challenge_ts) {
        const challengeTime = Date.parse(result.challenge_ts);
        if (!Number.isFinite(challengeTime) || Math.abs(Date.now() - challengeTime) > 10 * 60 * 1000) {
          throw new BadRequestException('人机验证已过期');
        }
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('人机验证服务暂时不可用');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async verifyLocal(input: CaptchaInput, client: unknown) {
    if (!input.captchaToken || !input.captchaAnswer) throw new BadRequestException('请输入图形验证码');
    const now = new Date();
    const store = this.store(client);
    await store.deleteMany({ where: { expiresAt: { lte: now } } });
    const tokenHash = hashAuthValue('captcha-token', input.captchaToken);
    const record = await store.findUnique({ where: { tokenHash } });
    if (!record) throw new BadRequestException('图形验证码已失效');
    if (record.consumedAt) throw new BadRequestException('图形验证码已使用，请刷新后重试');
    if (record.expiresAt <= now) throw new BadRequestException('图形验证码已过期');
    if (record.ipHash) {
      const remoteIp = input.remoteIp?.trim() || 'unknown';
      if (remoteIp === 'unknown') throw new BadRequestException('图形验证码已失效');
      const ipHash = hashAuthValue('captcha-ip', remoteIp);
      if (!safeEqual(record.ipHash, ipHash)) throw new BadRequestException('图形验证码已失效');
    }

    const answerHash = hashAuthValue('captcha-answer', this.normalizeAnswer(input.captchaAnswer));
    if (!safeEqual(record.answerHash, answerHash)) {
      const updated = await store.updateMany({
        where: { id: record.id, consumedAt: null, expiresAt: { gt: now }, attempts: { lt: MAX_ATTEMPTS } },
        data: { attempts: { increment: 1 } }
      });
      if (!updated.count) throw new BadRequestException('图形验证码错误次数过多，请刷新后重试');
      const latest = await store.findUnique({ where: { id: record.id } });
      if (!latest || latest.attempts >= MAX_ATTEMPTS) throw new BadRequestException('图形验证码错误次数过多，请刷新后重试');
      throw new BadRequestException('图形验证码错误');
    }

    const consumed = await store.updateMany({
      where: { id: record.id, tokenHash, answerHash, consumedAt: null, expiresAt: { gt: now }, attempts: { lt: MAX_ATTEMPTS } },
      data: { consumedAt: now }
    });
    if (!consumed.count) throw new BadRequestException('图形验证码已使用，请刷新后重试');
  }

  private store(client: unknown): CaptchaChallengeStore {
    return (client as CaptchaClient).captchaChallenge;
  }

  private normalizeAnswer(value: string): string {
    return value.trim().toLowerCase();
  }

  private turnstileAction(action: string): string {
    return action.trim().toLowerCase().replace(/_/g, '-');
  }
}
