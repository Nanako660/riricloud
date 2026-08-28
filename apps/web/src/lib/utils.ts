import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// 统一 className 合并工具（shadcn/ui 规范）
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
