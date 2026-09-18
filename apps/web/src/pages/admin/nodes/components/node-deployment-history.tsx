import * as React from 'react';
import { History, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime } from '@/lib/utils';
import { useNodeMutations, useNodeTasks, type NodeDeploymentTask } from '../use-nodes';

const TASK_PAGE_SIZE = 10;

function statusVariant(status: NodeDeploymentTask['status']) {
  if (status === 'COMPLETED') return 'default' as const;
  if (status === 'FAILED') return 'destructive' as const;
  return 'secondary' as const;
}

function taskVersion(task: NodeDeploymentTask) {
  if (task.version) return task.version;
  const release = task.asset?.release;
  if (!release) return null;
  return release.kind.toUpperCase() === 'AGENT' && release.revision === 1 ? release.upstreamVersion : `${release.upstreamVersion}-r${release.revision}`;
}

export function NodeDeploymentHistory({ nodeId }: { nodeId: string }) {
  const { t } = useTranslation(['admin', 'common']);
  const [page, setPage] = React.useState(1);
  const [statusFilter, setStatusFilter] = React.useState<'ALL' | string>('ALL');
  const [rollingBack, setRollingBack] = React.useState<NodeDeploymentTask | null>(null);
  const { data, isPending } = useNodeTasks(nodeId, { page, status: statusFilter === 'ALL' ? undefined : statusFilter });
  const { retryTask, rollbackTask } = useNodeMutations();
  const tasks = data?.data ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / TASK_PAGE_SIZE));

  const statusLabels: Record<string, string> = {
    QUEUED: t('admin:nodes.taskQueued'),
    DISPATCHED: t('admin:nodes.taskDispatched'),
    COMPLETED: t('admin:nodes.taskCompletedStatus'),
    FAILED: t('admin:nodes.taskFailedStatus')
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" />
          {t('admin:nodes.historyTitle')}
        </CardTitle>
        <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setPage(1); }}>
          <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('admin:nodes.statusAll')}</SelectItem>
            <SelectItem value="QUEUED">{t('admin:nodes.taskQueued')}</SelectItem>
            <SelectItem value="DISPATCHED">{t('admin:nodes.taskDispatched')}</SelectItem>
            <SelectItem value="COMPLETED">{t('admin:nodes.taskCompletedStatus')}</SelectItem>
            <SelectItem value="FAILED">{t('admin:nodes.taskFailedStatus')}</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-3">
        {isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : tasks.length ? (
          <>
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin:nodes.colTime')}</TableHead>
                  <TableHead>{t('admin:nodes.colTypeVersion')}</TableHead>
                  <TableHead>{t('admin:nodes.colOperation')}</TableHead>
                  <TableHead>{t('admin:nodes.colStatus')}</TableHead>
                  <TableHead className="text-right">{t('admin:nodes.colHandle')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                      {formatDateTime(task.requestedAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[11px]">
                          {task.kind === 'AGENT' ? 'Agent' : 'Sing-box'}
                        </Badge>
                        <span className="text-xs font-medium">{taskVersion(task) ?? '—'}</span>
                        {!task.assetId ? <Badge variant="secondary" className="text-[11px]">自定义 URL</Badge> : null}
                        <span className="text-xs text-muted-foreground">尝试 {task.attempts} 次</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{task.operation === 'ROLLBACK' ? t('admin:nodes.rollback') : '升级'}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(task.status)}>{statusLabels[task.status] ?? task.status}</Badge>
                      {task.errorMessage ? (
                        <p className="mt-1 max-w-64 break-all text-[11px] text-destructive" title={task.errorMessage}>
                          {task.errorMessage}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        {task.status === 'FAILED' || task.status === 'COMPLETED' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            disabled={retryTask.isPending}
                            onClick={() => retryTask.mutate({ nodeId, taskId: task.id })}
                          >
                            {t('admin:nodes.retry')}
                          </Button>
                        ) : null}
                        {task.previousAssetId ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            disabled={rollbackTask.isPending}
                            onClick={() => setRollingBack(task)}
                          >
                            <RotateCcw className="h-3 w-3" />
                            {t('admin:nodes.rollback')}
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {totalPages > 1 ? (
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  {t('common:table.previous')}
                </Button>
                <span className="text-xs text-muted-foreground">{page} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  {t('common:table.next')}
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState title="暂无分发记录" description="升级和回滚任务执行后将在此展示审计记录" className="border-0" />
        )}
      </CardContent>

      <AlertDialog open={Boolean(rollingBack)} onOpenChange={(open) => !open && setRollingBack(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('admin:nodes.rollbackConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('admin:nodes.rollbackConfirmDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (rollingBack) {
                  rollbackTask.mutate({ nodeId, taskId: rollingBack.id }, { onSuccess: () => setRollingBack(null) });
                }
              }}
            >
              {t('admin:nodes.confirmRollback')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
