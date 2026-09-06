import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const PREFIX = 'enc:v1:';

function encryptionKey(): Buffer {
  const configured = process.env.RIRICLOUD_ENCRYPTION_KEY?.trim() || process.env.JWT_SECRET?.trim();
  if (!configured && (process.env.NODE_ENV === 'production' || process.env.RIRICLOUD_ENV === 'production')) {
    throw new Error('RIRICLOUD_ENCRYPTION_KEY or JWT_SECRET must be configured in production');
  }
  return createHash('sha256').update(configured || 'riricloud-development-encryption-key').digest();
}

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function encryptSecret(value: string): string {
  if (!value || isEncryptedSecret(value)) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${PREFIX}${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptSecret(value: string): string {
  if (!isEncryptedSecret(value)) return value;
  const [, version, iv64, tag64, ciphertext64] = value.split(':');
  if (version !== 'v1' || !iv64 || !tag64 || !ciphertext64) throw new Error('invalid encrypted secret');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv64, 'base64'));
  decipher.setAuthTag(Buffer.from(tag64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext64, 'base64')), decipher.final()]).toString('utf8');
}
