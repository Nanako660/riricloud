'use strict';

const { isEmail } = require('class-validator');
const bcrypt = require('bcryptjs');

const DEMO_ADMIN_EMAIL = 'admin@riricloud.local';
const DEMO_ADMIN_PASSWORD = 'RiriCloud-Admin-2026!';
// 密码复杂度默认策略与 src/system/settings.service.ts DEFAULTS 保持一致：必须含小写字母与数字
const PASSWORD_COMPLEXITY_DEFAULTS = {
  passwordRequireLowercase: true,
  passwordRequireUppercase: false,
  passwordRequireDigit: true,
  passwordRequireSpecial: false
};
const PASSWORD_SETTING_KEYS = [
  'passwordMinLength',
  ...Object.keys(PASSWORD_COMPLEXITY_DEFAULTS)
];

const JWT_SECRET_PLACEHOLDER_PATTERNS = [
  /^replace-with-/i,
  /^your-super-secret/i,
  /^change(-|_)?me$/i,
  /^changeme-on-first-login$/i,
  /^dev-insecure-secret$/i,
  /^openssl-rand-hex-output$/i
];

function firstNonEmpty(...values) {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0) ?? null;
}

function resolveAdminCredentials(env = process.env, { allowDemoDefaults = false } = {}) {
  const email = firstNonEmpty(env.ADMIN_EMAIL, env.SEED_ADMIN_EMAIL) ?? (allowDemoDefaults ? DEMO_ADMIN_EMAIL : null);
  const password = firstNonEmpty(env.ADMIN_PASSWORD, env.SEED_ADMIN_PASSWORD) ??
    (allowDemoDefaults ? DEMO_ADMIN_PASSWORD : null);

  return {
    email: email ? email.trim() : null,
    password
  };
}

function validateAdminEmail(value) {
  const email = typeof value === 'string' ? value.trim() : '';
  if (!isEmail(email)) {
    throw new Error('管理员邮箱无效，请提供符合现有登录规则的邮箱地址');
  }
  return email.toLowerCase();
}

function buildPasswordStrengthPattern(complexity) {
  const lookaheads = [];
  if (complexity.passwordRequireLowercase) lookaheads.push('(?=.*[a-z])');
  if (complexity.passwordRequireUppercase) lookaheads.push('(?=.*[A-Z])');
  if (complexity.passwordRequireDigit) lookaheads.push('(?=.*\\d)');
  if (complexity.passwordRequireSpecial) lookaheads.push('(?=.*[^A-Za-z0-9\\s])');
  return lookaheads.length ? new RegExp(`${lookaheads.join('')}.+$`) : null;
}

function buildPasswordStrengthMessage(complexity) {
  const groups = [];
  if (complexity.passwordRequireLowercase) groups.push('小写字母');
  if (complexity.passwordRequireUppercase) groups.push('大写字母');
  if (complexity.passwordRequireDigit) groups.push('数字');
  if (complexity.passwordRequireSpecial) groups.push('特殊字符');
  return groups.length ? `密码必须包含：${groups.join('、')}` : '';
}

// 从 SystemSetting 读取密码策略；键缺失或取值非法时回退默认值（与 settings.service 语义一致）
async function resolvePasswordPolicy(prisma) {
  const policy = { passwordMinLength: 8, ...PASSWORD_COMPLEXITY_DEFAULTS };
  const settingStore = prisma?.systemSetting;
  if (!settingStore || typeof settingStore.findMany !== 'function') return policy;
  const rows = await settingStore.findMany({
    where: { key: { in: PASSWORD_SETTING_KEYS } },
    select: { key: true, value: true }
  });
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const minLength = Number(map.get('passwordMinLength'));
  if (Number.isInteger(minLength) && minLength >= 8 && minLength <= 64) {
    policy.passwordMinLength = minLength;
  }
  for (const key of Object.keys(PASSWORD_COMPLEXITY_DEFAULTS)) {
    const value = map.get(key)?.trim().toLowerCase();
    if (value === 'true' || value === '1') policy[key] = true;
    else if (value === 'false' || value === '0') policy[key] = false;
  }
  return policy;
}

function validateAdminPassword(value, minimum = 8, complexity = PASSWORD_COMPLEXITY_DEFAULTS) {
  const minLength = Number.isInteger(minimum) && minimum >= 8 && minimum <= 64 ? minimum : 8;
  if (typeof value !== 'string' || value.length < minLength || value.length > 64) {
    throw new Error(`管理员密码长度必须为 ${minLength}-64 位`);
  }
  const pattern = buildPasswordStrengthPattern(complexity);
  if (pattern && !pattern.test(value)) {
    throw new Error(buildPasswordStrengthMessage(complexity));
  }
  return value;
}

function validateJwtSecret(value) {
  const secret = typeof value === 'string' ? value.trim() : '';
  if (
    secret.length < 32 ||
    JWT_SECRET_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(secret))
  ) {
    throw new Error('JWT_SECRET 必须设置为至少 32 位的随机密钥，不能使用空值或模板占位值');
  }
  return secret;
}

async function ensureAdmin(prisma, options = {}) {
  const existingAdmin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    orderBy: { createdAt: 'asc' }
  });

  if (existingAdmin) {
    return { admin: existingAdmin, created: false };
  }

  const credentials = resolveAdminCredentials(process.env, options);
  if (!credentials.email || !credentials.password) {
    throw new Error(
      '数据库中不存在管理员，请配置 ADMIN_EMAIL 和 ADMIN_PASSWORD 后重试；兼容配置为 SEED_ADMIN_EMAIL 和 SEED_ADMIN_PASSWORD'
    );
  }

  const email = validateAdminEmail(credentials.email);
  const policy = await resolvePasswordPolicy(prisma);
  const password = validateAdminPassword(credentials.password, policy.passwordMinLength, policy);
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new Error(`管理员邮箱 ${email} 已被非 ADMIN 账号占用，bootstrap 不会自动提权，请更换 ADMIN_EMAIL`);
  }

  let admin;
  try {
    admin = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role: 'ADMIN'
      }
    });
  } catch (error) {
    // 多实例同时首启时允许后到实例复用先创建的管理员，避免无意义的启动失败。
    if (error?.code === 'P2002') {
      const racedAdmin = await prisma.user.findFirst({
        where: { role: 'ADMIN' },
        orderBy: { createdAt: 'asc' }
      });
      if (racedAdmin) return { admin: racedAdmin, created: false };
    }
    throw error;
  }

  console.log(`admin bootstrap: created ${admin.email}`);
  return { admin, created: true };
}

module.exports = {
  DEMO_ADMIN_EMAIL,
  DEMO_ADMIN_PASSWORD,
  PASSWORD_COMPLEXITY_DEFAULTS,
  ensureAdmin,
  resolveAdminCredentials,
  resolvePasswordPolicy,
  validateAdminEmail,
  validateAdminPassword,
  validateJwtSecret
};
