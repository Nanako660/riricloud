import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  title: string;
  description?: string;
  className?: string;
}

export function EmptyState({ title, description, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-10 text-center', className)}>
      <Inbox className="text-muted-foreground h-10 w-10" />
      <p className="font-medium">{title}</p>
      {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
    </div>
  );
}
