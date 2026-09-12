import { BadRequestException } from '@nestjs/common';
import {
  assertPasswordPolicy,
  assertPasswordStrength,
  buildPasswordStrengthPolicy,
  DEFAULT_PASSWORD_COMPLEXITY,
  passwordComplexityFromSettings
} from './auth-security';

describe('password policy', () => {
  it('默认策略要求小写字母与数字', () => {
    const policy = buildPasswordStrengthPolicy(DEFAULT_PASSWORD_COMPLEXITY);
    expect(policy.pattern).toBeInstanceOf(RegExp);
    expect(policy.message).toBe('密码必须包含：小写字母、数字');
    expect(() => assertPasswordStrength('ab12cd34', policy)).not.toThrow();
    expect(() => assertPasswordStrength('Strong-pass1!', policy)).not.toThrow();
  });

  it.each([
    'PASSWORD123!',
    'Password!!!!',
    'ABCDEFGH',
    'abcdefgh',
    '        '
  ])('默认策略拒绝缺少必需字符类别的密码 %s', (password) => {
    expect(() => assertPasswordStrength(password, buildPasswordStrengthPolicy(DEFAULT_PASSWORD_COMPLEXITY))).toThrow(BadRequestException);
  });

  it('严格策略要求四类字符齐全', () => {
    const policy = buildPasswordStrengthPolicy({ requireLowercase: true, requireUppercase: true, requireDigit: true, requireSpecial: true });
    expect(() => assertPasswordStrength('Strong-pass1!', policy)).not.toThrow();
    expect(() => assertPasswordStrength('StrongPass1', policy)).toThrow('密码必须包含：小写字母、大写字母、数字、特殊字符');
  });

  it('全部类别关闭时仅保留长度校验', () => {
    const policy = buildPasswordStrengthPolicy({ requireLowercase: false, requireUppercase: false, requireDigit: false, requireSpecial: false });
    expect(policy.pattern).toBeNull();
    expect(policy.message).toBe('');
    expect(() => assertPasswordStrength('any characters here', policy)).not.toThrow();
  });

  it('先执行动态最小长度，再执行强度校验', () => {
    const policy = buildPasswordStrengthPolicy(DEFAULT_PASSWORD_COMPLEXITY);
    expect(() => assertPasswordPolicy('Short1!', 8, policy)).toThrow('密码至少 8 位');
    expect(() => assertPasswordPolicy('ab12cd', 8, policy)).toThrow('密码至少 8 位');
    expect(() => assertPasswordPolicy('ab12cd34', 8, policy)).not.toThrow();
  });
});

describe('passwordComplexityFromSettings', () => {
  it('设置缺失时回退默认策略', () => {
    expect(passwordComplexityFromSettings(undefined)).toEqual(DEFAULT_PASSWORD_COMPLEXITY);
    expect(passwordComplexityFromSettings(null)).toEqual(DEFAULT_PASSWORD_COMPLEXITY);
    expect(passwordComplexityFromSettings({})).toEqual(DEFAULT_PASSWORD_COMPLEXITY);
  });

  it('按设置逐字段覆盖默认策略', () => {
    expect(
      passwordComplexityFromSettings({ passwordRequireUppercase: true, passwordRequireDigit: false })
    ).toEqual({ requireLowercase: true, requireUppercase: true, requireDigit: false, requireSpecial: false });
  });
});
