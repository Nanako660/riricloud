import * as React from 'react';
import { cn } from '@/lib/utils';

// 所有子页面统一嵌 PageContainer（FRONTEND_UI_GUIDELINES 组件分层）
export function PageContainer({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6', className)}>{children}</div>;
}

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex items-center justify-between space-y-2">
      <div className="space-y-0.5">
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
      </div>
    </div>
  );
}
