import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, children, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-10 text-center', className)}>
      <Inbox className="text-muted-foreground h-10 w-10" />
      <p className="font-medium">{title}</p>
      {description ? <p className="text-muted-foreground text-sm max-w-sm">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
      {children}
    </div>
  );
}
