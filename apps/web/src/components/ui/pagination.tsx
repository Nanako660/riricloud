import * as React from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// 分页按钮样式基元（data-table 分页区使用）
const Pagination = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-wrap items-center justify-end gap-1', className)} {...props} />
);
Pagination.displayName = 'Pagination';

const PaginationButton = Button;

function PaginationInfo({ page, totalPages }: { page: number; totalPages: number }) {
  const { t } = useTranslation('common');
  return (
    <span className="text-muted-foreground min-w-28 text-right text-sm tabular-nums">
      {t('table.pageInfo', { page, totalPages: Math.max(totalPages, 1) })}
    </span>
  );
}

function PaginationPrevious({ onClick, disabled }: { onClick?: () => void; disabled?: boolean }) {
  const { t } = useTranslation('common');
  return (
    <Button variant="outline" size="sm" className="gap-1" onClick={onClick} disabled={disabled}>
      <ChevronLeft className="h-4 w-4" />
      {t('table.previous')}
    </Button>
  );
}

function PaginationNext({ onClick, disabled }: { onClick?: () => void; disabled?: boolean }) {
  const { t } = useTranslation('common');
  return (
    <Button variant="outline" size="sm" className="gap-1" onClick={onClick} disabled={disabled}>
      {t('table.next')}
      <ChevronRight className="h-4 w-4" />
    </Button>
  );
}

const PaginationEllipsis = ({ className }: { className?: string }) => (
  <MoreHorizontal className={cn('text-muted-foreground h-4 w-4', className)} />
);

export { Pagination, PaginationButton, PaginationInfo, PaginationPrevious, PaginationNext, PaginationEllipsis };
