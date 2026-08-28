import { cn } from '@/lib/utils';

// 加载态骨架（禁全屏 Spinner，见 FRONTEND_UI_GUIDELINES §6.3）
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('bg-muted animate-pulse rounded-md', className)} {...props} />;
}

export { Skeleton };
