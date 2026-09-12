import { BadRequestException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getJwtSecret } from './runtime-config';

export const MAX_EMAIL_LENGTH = 254;
export const MAX_PASSWORD_LENGTH = 64;

// 密码字符类别要求，开关来自系统设置 passwordRequire*（见 settings.service DEFAULTS）
export interface PasswordComplexity {
  requireLowercase: boolean;
  requireUppercase: boolean;
  requireDigit: boolean;
  requireSpecial: boolean;
}

// 与 settings.service DEFAULTS 保持一致：默认必须含小写字母与数字
export const DEFAULT_PASSWORD_COMPLEXITY: PasswordComplexity = {
  requireLowercase: true,
  requireUppercase: false,
  requireDigit: true,
  requireSpecial: false
};

// SystemSettings 中密码复杂度相关字段的结构视图
export interface PasswordComplexitySource {
  passwordRequireLowercase: boolean;
  passwordRequireUppercase: boolean;
  passwordRequireDigit: boolean;
  passwordRequireSpecial: boolean;
}

export interface PasswordStrengthPolicy {
  // null 表示无字符类别要求（仅校验长度）
  pattern: RegExp | null;
  message: string;
}

// 缺失或未配置的字段回退默认策略（fail-closed，与前端 passwordComplexityFromSettings 语义一致）
export function passwordComplexityFromSettings(source?: Partial<PasswordComplexitySource> | null): PasswordComplexity {
  return {
    requireLowercase: source?.passwordRequireLowercase ?? DEFAULT_PASSWORD_COMPLEXITY.requireLowercase,
    requireUppercase: source?.passwordRequireUppercase ?? DEFAULT_PASSWORD_COMPLEXITY.requireUppercase,
    requireDigit: source?.passwordRequireDigit ?? DEFAULT_PASSWORD_COMPLEXITY.requireDigit,
    requireSpecial: source?.passwordRequireSpecial ?? DEFAULT_PASSWORD_COMPLEXITY.requireSpecial
  };
}

export function buildPasswordStrengthPolicy(complexity: PasswordComplexity): PasswordStrengthPolicy {
  const groups: string[] = [];
  const lookaheads: string[] = [];
  if (complexity.requireLowercase) {
    groups.push('小写字母');
    lookaheads.push('(?=.*[a-z])');
  }
  if (complexity.requireUppercase) {
    groups.push('大写字母');
    lookaheads.push('(?=.*[A-Z])');
  }
  if (complexity.requireDigit) {
    groups.push('数字');
    lookaheads.push('(?=.*\\d)');
  }
  if (complexity.requireSpecial) {
    groups.push('特殊字符');
    lookaheads.push('(?=.*[^A-Za-z0-9\\s])');
  }
  return {
    pattern: lookaheads.length ? new RegExp(`${lookaheads.join('')}.+$`) : null,
    message: groups.length ? `密码必须包含：${groups.join('、')}` : ''
  };
}

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

export function assertPasswordStrength(password: string, policy: PasswordStrengthPolicy): void {
  if (policy.pattern && !policy.pattern.test(password)) {
    throw new BadRequestException(policy.message);
  }
}

export function assertPasswordPolicy(password: string, minimum: number, policy: PasswordStrengthPolicy): void {
  assertPasswordLength(password, minimum);
  assertPasswordStrength(password, policy);
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
