import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
  className?: string;
}

export function StatCard({ title, value, hint, icon, className }: StatCardProps) {
  return (
    <Card className={cn(className)}>
      <CardContent className="p-3.5 sm:p-4">
        <div className="flex items-center justify-between gap-2 text-muted-foreground">
          <p className="truncate text-xs font-medium">{title}</p>
          {icon ? <div className="shrink-0 [&>svg]:size-4">{icon}</div> : null}
        </div>
        <div className="mt-2 space-y-0.5">
          <p className="truncate text-lg font-bold tabular-nums tracking-tight sm:text-xl" title={value}>{value}</p>
          {hint ? <p className="truncate text-[11px] text-muted-foreground" title={hint}>{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
