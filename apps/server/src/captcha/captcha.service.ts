import { BadRequestException, Injectable } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import * as svgCaptcha from 'svg-captcha';
import { getJwtSecret } from '../common/runtime-config';
import { SettingsService } from '../system/settings.service';

export interface CaptchaInput {
  captchaToken?: string;
  captchaAnswer?: string;
  turnstileToken?: string;
  remoteIp?: string;
}

@Injectable()
export class CaptchaService {
  private readonly consumedTokens = new Map<string, number>();

  constructor(private readonly settingsService: SettingsService) {}

  createLocalChallenge() {
    const captcha = svgCaptcha.createMathExpr({
      width: 160,
      height: 52,
      fontSize: 34,
      noise: 2,
      color: false,
      inverse: false,
      mathMin: 1,
      mathMax: 20
    });
    const expiresAt = Date.now() + 5 * 60 * 1000;
    const payload = Buffer.from(JSON.stringify({ answer: captcha.text, expiresAt, nonce: randomUUID() })).toString('base64url');
    const signature = this.sign(payload);
    return { svg: captcha.data, captchaToken: `${payload}.${signature}`, expiresAt: new Date(expiresAt).toISOString() };
  }

  async verifyCaptcha(input: CaptchaInput): Promise<void> {
    const settings = await this.settingsService.getSettings();
    const mode = settings.captchaMode ?? 'OFF';
    if (mode === 'OFF') return;
    if (mode === 'LOCAL') {
      this.verifyLocal(input);
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
      const result = (await response.json()) as { success?: boolean };
      if (!response.ok || !result.success) throw new BadRequestException('人机验证未通过');
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('人机验证服务暂时不可用');
    } finally {
      clearTimeout(timeout);
    }
  }

  private verifyLocal(input: CaptchaInput) {
    if (!input.captchaToken || !input.captchaAnswer) throw new BadRequestException('请输入图形验证码');
    const [payload, signature] = input.captchaToken.split('.');
    if (!payload || !signature || !this.safeEqual(signature, this.sign(payload))) throw new BadRequestException('图形验证码已失效');
    if (this.consumedTokens.has(input.captchaToken)) throw new BadRequestException('图形验证码已使用，请刷新后重试');
    let parsed: { answer?: string; expiresAt?: number };
    try {
      parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { answer?: string; expiresAt?: number };
    } catch {
      throw new BadRequestException('图形验证码已失效');
    }
    if (!parsed.answer || !parsed.expiresAt || parsed.expiresAt <= Date.now()) throw new BadRequestException('图形验证码已过期');
    if (parsed.answer.trim().toLowerCase() !== input.captchaAnswer.trim().toLowerCase()) throw new BadRequestException('图形验证码错误');
    this.consumedTokens.set(input.captchaToken, parsed.expiresAt);
    this.cleanupConsumedTokens();
  }

  private sign(payload: string): string {
    return createHmac('sha256', getJwtSecret()).update(payload).digest('base64url');
  }

  private safeEqual(left: string, right: string): boolean {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private cleanupConsumedTokens() {
    const now = Date.now();
    for (const [token, expiresAt] of this.consumedTokens) {
      if (expiresAt <= now) this.consumedTokens.delete(token);
    }
  }
}
