import { BadRequestException } from '@nestjs/common';
import { assertPasswordPolicy, assertPasswordStrength } from './auth-security';

describe('password policy', () => {
  it('接受包含四类字符且满足最小长度的密码', () => {
    expect(() => assertPasswordPolicy('Strong-pass1!', 8)).not.toThrow();
  });

  it.each([
    'password123',
    'PASSWORD123!',
    'Password!!!!',
    'Password123',
    '        '
  ])('拒绝弱密码 %s', (password) => {
    expect(() => assertPasswordStrength(password)).toThrow(BadRequestException);
  });

  it('先执行动态最小长度，再执行强度校验', () => {
    expect(() => assertPasswordPolicy('Short1!', 8)).toThrow('密码至少 8 位');
  });
});
