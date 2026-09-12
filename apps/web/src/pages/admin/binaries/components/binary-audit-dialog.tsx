import * as React from 'react';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/shared/responsive-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime } from '@/lib/utils';
import { BINARY_AUDIT_ACTION_LABELS } from '../binary-labels';
import { useBinaryAuditLogs } from '../use-binaries';

const AUDIT_PAGE_SIZE = 20;

const ACTION_FILTERS = [
  'RESOURCE_IMPORTED',
  'RESOURCE_UPDATED',
  'RESOURCE_ACTIVATED',
  'RESOURCE_DISABLED',
  'RESOURCE_RETIRED',
  'RESOURCE_RESTORED',
  'RESOURCE_DEFAULT_CHANGED',
  'RESOURCE_DELETED'
] as const;

export function BinaryAuditDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [page, setPage] = React.useState(1);
  const [action, setAction] = React.useState<'ALL' | string>('ALL');
  const { data, isPending } = useBinaryAuditLogs({ page, action: action === 'ALL' ? undefined : action });
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / AUDIT_PAGE_SIZE));

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent size="wide">
        <DialogHeader>
          <DialogTitle>操作审计</DialogTitle>
          <DialogDescription>资源中心全部操作的审计记录，保留资源删除前的操作轨迹。</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-2">
          <Select
            value={action}
            onValueChange={(value) => {
              setAction(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部动作</SelectItem>
              {ACTION_FILTERS.map((item) => (
                <SelectItem key={item} value={item}>{BINARY_AUDIT_ACTION_LABELS[item] ?? item}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">共 {data?.total ?? 0} 条</span>
        </div>
        {isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (data?.data.length ?? 0) ? (
          <>
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>动作</TableHead>
                    <TableHead>资源</TableHead>
                    <TableHead>操作者</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data!.data.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                        {formatDateTime(log.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={log.action === 'RESOURCE_DELETED' ? 'destructive' : 'secondary'}>
                          {BINARY_AUDIT_ACTION_LABELS[log.action] ?? log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {log.releaseId ? log.releaseId.slice(0, 8) : '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {log.operator ? (
                          <span className="break-words">{log.operator.nickname || log.operator.email}</span>
                        ) : (
                          <span className="text-muted-foreground">{log.operatorId ? log.operatorId.slice(0, 8) : '系统'}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
              <Button variant="outline" size="sm" className="h-7" disabled={page <= 1} onClick={() => setPage((prev) => prev - 1)}>上一页</Button>
              <span>第 {data!.page} / {totalPages} 页</span>
              <Button variant="outline" size="sm" className="h-7" disabled={page >= totalPages} onClick={() => setPage((prev) => prev + 1)}>下一页</Button>
            </div>
          </>
        ) : (
          <EmptyState title="暂无审计记录" description="资源操作发生后会在这里留下轨迹。" className="border-0" />
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
