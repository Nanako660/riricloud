import * as React from 'react';
import { cn } from '@/lib/utils';

// 所有子页面统一嵌 PageContainer（FRONTEND_UI_GUIDELINES 组件分层）
export function PageContainer({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex min-w-0 flex-1 flex-col gap-4 p-3 sm:p-4 md:gap-6 md:p-6 animate-in fade-in-0 zoom-in-[0.985] duration-300 ease-out', className)}>
      {children}
    </div>
  );
}

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1.5 space-y-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-0.5">
        <h2 className="break-words text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
        {description ? <p className="break-words text-muted-foreground text-sm">{description}</p> : null}
      </div>
    </div>
  );
}
