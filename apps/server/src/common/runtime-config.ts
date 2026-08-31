const JWT_SECRET_PLACEHOLDER_PATTERNS = [
  /^replace-with-/i,
  /^your-super-secret/i,
  /^change(-|_)?me$/i,
  /^changeme-on-first-login$/i,
  /^dev-insecure-secret$/i,
  /^openssl-rand-hex-output$/i
];

export function getJwtSecret(value = process.env.JWT_SECRET): string {
  const secret = typeof value === 'string' ? value.trim() : '';
  if (
    secret.length < 32 ||
    JWT_SECRET_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(secret))
  ) {
    throw new Error('JWT_SECRET 必须设置为至少 32 位的随机密钥，不能使用空值或模板占位值');
  }
  return secret;
}
