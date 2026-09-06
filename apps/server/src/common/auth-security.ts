import { BadRequestException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getJwtSecret } from './runtime-config';

export const MAX_EMAIL_LENGTH = 254;
export const MAX_PASSWORD_LENGTH = 64;
export const PASSWORD_STRENGTH_MESSAGE = '密码必须同时包含大写字母、小写字母、数字和特殊字符';
export const PASSWORD_STRENGTH_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s]).+$/;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function assertEmailLength(email: string): void {
  if (email.length > MAX_EMAIL_LENGTH) {
    throw new BadRequestException('邮箱地址过长');
  }
}

export function assertPasswordLength(password: string, minimum: number): void {
  if (password.length < minimum) {
    throw new BadRequestException(`密码至少 ${minimum} 位`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new BadRequestException(`密码最多 ${MAX_PASSWORD_LENGTH} 位`);
  }
}

export function assertPasswordStrength(password: string): void {
  if (!PASSWORD_STRENGTH_PATTERN.test(password)) {
    throw new BadRequestException(PASSWORD_STRENGTH_MESSAGE);
  }
}

export function assertPasswordPolicy(password: string, minimum: number): void {
  assertPasswordLength(password, minimum);
  assertPasswordStrength(password);
}

export function normalizeVerificationCode(value: string): string {
  return value.trim();
}

export function hashAuthValue(purpose: string, value: string): string {
  return createHmac('sha256', getJwtSecret()).update(`${purpose}\u0000${value}`).digest('hex');
}

export function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function resolveClientIp(ip: string | undefined, forwardedFor?: string): string {
  if (process.env.RIRICLOUD_TRUST_PROXY === 'true') {
    return forwardedFor?.split(',')[0]?.trim() || ip || 'unknown';
  }
  return ip || 'unknown';
}

export function configuredHostname(publicBaseUrl?: string | null): string | undefined {
  if (!publicBaseUrl) return undefined;
  try {
    return new URL(publicBaseUrl).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}
