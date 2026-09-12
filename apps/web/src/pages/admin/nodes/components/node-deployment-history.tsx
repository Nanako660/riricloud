import * as React from 'react';
import { History, RotateCcw } from 'lucide-react';
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

const STATUS_LABELS: Record<string, string> = {
  QUEUED: '排队中',
  DISPATCHED: '已下发',
  COMPLETED: '已完成',
  FAILED: '失败'
};

function statusVariant(status: NodeDeploymentTask['status']) {
  if (status === 'COMPLETED') return 'default' as const;
  if (status === 'FAILED') return 'destructive' as const;
  return 'secondary' as const;
}

function taskVersion(task: NodeDeploymentTask) {
  if (task.version) return task.version;
  const release = task.asset?.release;
  return release ? `${release.upstreamVersion}-r${release.revision}` : null;
}

export function NodeDeploymentHistory({ nodeId }: { nodeId: string }) {
  const [page, setPage] = React.useState(1);
  const [statusFilter, setStatusFilter] = React.useState<'ALL' | string>('ALL');
  const [rollingBack, setRollingBack] = React.useState<NodeDeploymentTask | null>(null);
  const { data, isPending } = useNodeTasks(nodeId, { page, status: statusFilter === 'ALL' ? undefined : statusFilter });
  const { retryTask, rollbackTask } = useNodeMutations();
  const tasks = data?.data ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / TASK_PAGE_SIZE));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" />
          升级分发记录
        </CardTitle>
        <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setPage(1); }}>
          <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">全部状态</SelectItem>
            <SelectItem value="QUEUED">排队中</SelectItem>
            <SelectItem value="DISPATCHED">已下发</SelectItem>
            <SelectItem value="COMPLETED">已完成</SelectItem>
            <SelectItem value="FAILED">失败</SelectItem>
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
                  <TableHead>时间</TableHead>
                  <TableHead>类型与版本</TableHead>
                  <TableHead>操作</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">处理</TableHead>
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
                        <span className="text-xs text-muted-foreground">尝试 {task.attempts} 次</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{task.operation === 'ROLLBACK' ? '回滚' : '升级'}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(task.status)}>{STATUS_LABELS[task.status] ?? task.status}</Badge>
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
                            重试
                          </Button>
                        ) : null}
                        {task.previousAssetId ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={() => setRollingBack(task)}
                          >
                            <RotateCcw className="size-3" />
                            回滚
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>共 {data?.total ?? 0} 条</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-7" disabled={page <= 1} onClick={() => setPage((prev) => prev - 1)}>上一页</Button>
                <span>第 {data?.page ?? 1} / {totalPages} 页</span>
                <Button variant="outline" size="sm" className="h-7" disabled={page >= totalPages} onClick={() => setPage((prev) => prev + 1)}>下一页</Button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState title="暂无分发记录" description="该节点尚未产生 Agent / Sing-box 升级任务。" className="border-0" />
        )}
      </CardContent>

      <AlertDialog open={!!rollingBack} onOpenChange={(open) => !open && setRollingBack(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>回滚到上一版本？</AlertDialogTitle>
            <AlertDialogDescription>
              将按该任务记录重新下发之前的 Agent / Sing-box 版本，节点完成后自动恢复原版本运行。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (rollingBack) rollbackTask.mutate({ nodeId, taskId: rollingBack.id });
                setRollingBack(null);
              }}
            >
              确认回滚
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
