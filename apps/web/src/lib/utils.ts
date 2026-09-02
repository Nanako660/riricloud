import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// 统一 className 合并工具（shadcn/ui 规范）
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 统一全局流量字节格式化工具（智能去除多余末尾 0，如 100 GB、99.9 KB、1.25 GB）
export function formatBytes(bytes: number | bigint | null | undefined, decimals = 2): string {
  if (bytes == null) return '0 B';
  const num = typeof bytes === 'bigint' ? Number(bytes) : bytes;
  if (num <= 0 || !Number.isFinite(num)) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(Math.floor(Math.log(num) / Math.log(1024)), units.length - 1);
  if (i === 0) return `${num} B`;

  const val = parseFloat((num / 1024 ** i).toFixed(decimals));
  return `${val} ${units[i]}`;
}
