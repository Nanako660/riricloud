import { Inbox } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, children, icon, className }: EmptyStateProps) {
  const { t } = useTranslation('common');
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2.5 rounded-lg border border-dashed border-border/70 p-10 text-center', className)}>
      {icon ?? <Inbox className="text-muted-foreground/60 h-10 w-10" />}
      <p className="font-medium text-foreground">{title ?? t('table.empty')}</p>
      {description ? <p className="text-muted-foreground text-sm max-w-sm">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
      {children}
    </div>
  );
}
