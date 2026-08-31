import { getJwtSecret } from './runtime-config';

describe('运行时安全配置', () => {
  it('接受长度足够的非占位 JWT_SECRET', () => {
    expect(getJwtSecret('a'.repeat(32))).toBe('a'.repeat(32));
  });

  it.each([
    undefined,
    '',
    'short-secret',
    'replace-with-a-random-secret-at-least-32-characters',
    'dev-insecure-secret'
  ])('拒绝不安全 JWT_SECRET: %s', (secret) => {
    expect(() => getJwtSecret(secret)).toThrow(/JWT_SECRET/);
  });
});
