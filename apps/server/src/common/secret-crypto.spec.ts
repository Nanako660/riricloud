import { decryptSecret, encryptSecret } from './secret-crypto';

describe('secret-crypto', () => {
  const originalKey = process.env.RIRICLOUD_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.RIRICLOUD_ENCRYPTION_KEY = 'test-encryption-key-for-security-regression';
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.RIRICLOUD_ENCRYPTION_KEY;
    else process.env.RIRICLOUD_ENCRYPTION_KEY = originalKey;
  });

  it('使用 AES-GCM 加密并可恢复原文', () => {
    const encrypted = encryptSecret('smtp-password');
    expect(encrypted).toMatch(/^enc:v1:/);
    expect(encrypted).not.toContain('smtp-password');
    expect(decryptSecret(encrypted)).toBe('smtp-password');
  });

  it('同一明文每次使用不同随机 IV', () => {
    expect(encryptSecret('same-value')).not.toBe(encryptSecret('same-value'));
  });

  it('保留旧版明文配置的读取兼容性', () => {
    expect(decryptSecret('legacy-value')).toBe('legacy-value');
  });
});
