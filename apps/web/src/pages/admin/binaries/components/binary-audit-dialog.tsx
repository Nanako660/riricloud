import * as React from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation(['admin', 'common']);
  const [page, setPage] = React.useState(1);
  const [action, setAction] = React.useState<'ALL' | string>('ALL');
  const { data, isPending } = useBinaryAuditLogs({ page, action: action === 'ALL' ? undefined : action });
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / AUDIT_PAGE_SIZE));

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent size="wide">
        <DialogHeader>
          <DialogTitle>{t('admin:binaries.auditTitle')}</DialogTitle>
          <DialogDescription>{t('admin:binaries.auditDesc')}</DialogDescription>
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
              <SelectItem value="ALL">{t('admin:binaries.allActions')}</SelectItem>
              {ACTION_FILTERS.map((item) => (
                <SelectItem key={item} value={item}>{BINARY_AUDIT_ACTION_LABELS[item] ?? item}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{t('admin:binaries.totalLogs', { total: data?.total ?? 0 })}</span>
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
                    <TableHead>{t('admin:binaries.colTime')}</TableHead>
                    <TableHead>{t('admin:binaries.colAction')}</TableHead>
                    <TableHead>{t('admin:binaries.colResourceShort')}</TableHead>
                    <TableHead>{t('admin:binaries.colOperator')}</TableHead>
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
                          <span className="text-muted-foreground">{log.operatorId ? log.operatorId.slice(0, 8) : t('admin:binaries.operatorSystem')}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
              <Button variant="outline" size="sm" className="h-7" disabled={page <= 1} onClick={() => setPage((prev) => prev - 1)}>
                {t('common:table.previous')}
              </Button>
              <span>{t('admin:binaries.pagination', { current: data!.page, total: totalPages })}</span>
              <Button variant="outline" size="sm" className="h-7" disabled={page >= totalPages} onClick={() => setPage((prev) => prev + 1)}>
                {t('common:table.next')}
              </Button>
            </div>
          </>
        ) : (
          <EmptyState title={t('admin:binaries.emptyAuditTitle')} description={t('admin:binaries.emptyAuditDesc')} className="border-0" />
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
