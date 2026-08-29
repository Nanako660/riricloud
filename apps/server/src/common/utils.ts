import { createHash } from 'node:crypto';

// 字节数格式化为人类可读（保留 2 位小数）
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(2)} ${units[i]}`;
}

// 生成 64 位高熵十六进制 AgentToken（文档约定：每节点唯一凭证）
export function generateAgentToken(): string {
  return createHash('sha256')
    .update(`${Date.now()}-${Math.random()}-${process.pid}`)
    .digest('hex')
    .slice(0, 64);
}

// 判断用户是否可正常使用订阅：激活 + 未过期 + 未超配额
export function isUserEntitled(user: {
  isActive: boolean;
  expireAt: Date | null;
  trafficLimitBytes: bigint;
  trafficUsedBytes: bigint;
}): boolean {
  if (!user.isActive) return false;
  if (user.expireAt && user.expireAt.getTime() < Date.now()) return false;
  return user.trafficUsedBytes < user.trafficLimitBytes;
}

// 纯对象深合并：数组与标量整体替换，嵌套 plain object 递归合并（用于 configOverride 覆盖生成配置）
export function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = result[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      result[key] = deepMerge(existing, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
