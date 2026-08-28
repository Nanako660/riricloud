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
