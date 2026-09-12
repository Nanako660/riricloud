import { z } from 'zod';

// 密码字符类别要求，开关来自系统设置 passwordRequire*（与后端 auth-security.ts 的动态策略保持一致）
export interface PasswordComplexity {
  requireLowercase: boolean;
  requireUppercase: boolean;
  requireDigit: boolean;
  requireSpecial: boolean;
}

// 默认策略与后端 settings.service DEFAULTS 保持一致：必须包含小写字母与数字
export const DEFAULT_PASSWORD_COMPLEXITY: PasswordComplexity = {
  requireLowercase: true,
  requireUppercase: false,
  requireDigit: true,
  requireSpecial: false
};

// 公开设置中与密码复杂度相关的字段
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

// 公开设置可能尚未加载（undefined）或缺少新字段，按默认策略兜底
export function passwordComplexityFromSettings(source?: Partial<PasswordComplexitySource> | null): PasswordComplexity {
  return {
    requireLowercase: source?.passwordRequireLowercase ?? DEFAULT_PASSWORD_COMPLEXITY.requireLowercase,
    requireUppercase: source?.passwordRequireUppercase ?? DEFAULT_PASSWORD_COMPLEXITY.requireUppercase,
    requireDigit: source?.passwordRequireDigit ?? DEFAULT_PASSWORD_COMPLEXITY.requireDigit,
    requireSpecial: source?.passwordRequireSpecial ?? DEFAULT_PASSWORD_COMPLEXITY.requireSpecial
  };
}

function passwordComplexityGroups(complexity: PasswordComplexity): string[] {
  const groups: string[] = [];
  if (complexity.requireLowercase) groups.push('小写字母');
  if (complexity.requireUppercase) groups.push('大写字母');
  if (complexity.requireDigit) groups.push('数字');
  if (complexity.requireSpecial) groups.push('特殊字符');
  return groups;
}

export function buildPasswordStrengthPolicy(complexity: PasswordComplexity): PasswordStrengthPolicy {
  const groups = passwordComplexityGroups(complexity);
  const lookaheads: string[] = [];
  if (complexity.requireLowercase) lookaheads.push('(?=.*[a-z])');
  if (complexity.requireUppercase) lookaheads.push('(?=.*[A-Z])');
  if (complexity.requireDigit) lookaheads.push('(?=.*\\d)');
  if (complexity.requireSpecial) lookaheads.push('(?=.*[^A-Za-z0-9\\s])');
  return {
    pattern: lookaheads.length ? new RegExp(`${lookaheads.join('')}.+$`) : null,
    message: groups.length ? `密码必须包含：${groups.join('、')}` : ''
  };
}

// 表单 placeholder 等提示片段，如「含小写字母、数字」；无复杂度要求时返回空串
export function passwordComplexityHint(complexity: PasswordComplexity): string {
  const groups = passwordComplexityGroups(complexity);
  return groups.length ? `含${groups.join('、')}` : '';
}

// 密码字段 zod 校验：动态最小长度 + 8-64 绝对边界 + 字符类别复杂度
export function passwordZodSchema(minLength: number, policy: PasswordStrengthPolicy): z.ZodString {
  const base = z.string().min(minLength, `密码至少 ${minLength} 位`).max(64, '密码最多 64 位');
  return policy.pattern ? base.regex(policy.pattern, policy.message) : base;
}
