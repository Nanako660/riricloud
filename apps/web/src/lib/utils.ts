import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import i18n, { normalizeLocale } from '@/i18n/config';

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

export function formatRate(bytesPerSecond: number | null | undefined, decimals = 1): string {
  return `${formatBytes(bytesPerSecond, decimals)}/s`;
}

export function formatCurrency(cents: number | null | undefined): string {
  const locale = normalizeLocale(i18n.language);
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'CNY' }).format((cents ?? 0) / 100);
}

export function formatYuan(yuan: number | null | undefined): string {
  const locale = normalizeLocale(i18n.language);
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'CNY' }).format(yuan ?? 0);
}

export function formatRelativeTime(date: Date | string | number | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';

  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 10) return i18n.t('common:time.justNow');
  if (diffSec < 60) return i18n.t('common:time.secondsAgo', { count: diffSec });
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return i18n.t('common:time.minutesAgo', { count: diffMin });
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return i18n.t('common:time.hoursAgo', { count: diffHour });
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return i18n.t('common:time.daysAgo', { count: diffDay });
  return formatDate(d);
}

let defaultSystemTimezone = 'Asia/Shanghai';

export function setDefaultSystemTimezone(timeZone: string | null | undefined): void {
  if (!timeZone || !timeZone.trim()) return;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timeZone.trim() });
    defaultSystemTimezone = timeZone.trim();
  } catch {
    // 忽略无效时区
  }
}

export function getDefaultSystemTimezone(): string {
  return defaultSystemTimezone;
}

export function formatDateTime(
  date: Date | string | number | null | undefined,
  timeZone?: string,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return '—';
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';

  const tz = timeZone?.trim() || defaultSystemTimezone;
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      ...options
    }).format(d).replace(/\//g, '-');
  } catch {
    return d.toLocaleString('zh-CN');
  }
}

export function formatDate(
  date: Date | string | number | null | undefined,
  timeZone?: string,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return '—';
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';

  const tz = timeZone?.trim() || defaultSystemTimezone;
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...options
    }).format(d).replace(/\//g, '-');
  } catch {
    return d.toLocaleDateString('zh-CN');
  }
}
