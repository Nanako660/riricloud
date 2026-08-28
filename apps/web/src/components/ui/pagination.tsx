import * as React from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// 分页按钮样式基元（data-table 分页区使用）
const Pagination = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-wrap items-center justify-end gap-1', className)} {...props} />
);
Pagination.displayName = 'Pagination';

const PaginationButton = Button;

function PaginationInfo({ page, totalPages }: { page: number; totalPages: number }) {
  return (
    <span className="text-muted-foreground w-28 text-right text-sm tabular-nums">
      第 {page} / {Math.max(totalPages, 1)} 页
    </span>
  );
}

function PaginationPrevious({ onClick, disabled }: { onClick?: () => void; disabled?: boolean }) {
  return (
    <Button variant="outline" size="sm" className="gap-1" onClick={onClick} disabled={disabled}>
      <ChevronLeft className="h-4 w-4" />
      上一页
    </Button>
  );
}

function PaginationNext({ onClick, disabled }: { onClick?: () => void; disabled?: boolean }) {
  return (
    <Button variant="outline" size="sm" className="gap-1" onClick={onClick} disabled={disabled}>
      下一页
      <ChevronRight className="h-4 w-4" />
    </Button>
  );
}

const PaginationEllipsis = ({ className }: { className?: string }) => (
  <MoreHorizontal className={cn('text-muted-foreground h-4 w-4', className)} />
);

export { Pagination, PaginationButton, PaginationInfo, PaginationPrevious, PaginationNext, PaginationEllipsis };
