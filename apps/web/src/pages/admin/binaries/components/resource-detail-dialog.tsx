import * as React from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/shared/responsive-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDateTime } from '@/lib/utils';
import {
  BINARY_COMPATIBILITY_LABELS,
  BINARY_DEPLOYMENT_STATUS_LABELS,
  BINARY_STATUS_LABELS,
  bytes,
  compatibilityEntries,
  deploymentBadgeVariant,
  operationLabel,
  sourceLabel
} from '../binary-labels';
import {
  useAdminBinaryResource,
  useBinaryResourceDeployments,
  useBinaryResourceMutations,
  type BinaryDeploymentStatus
} from '../use-binaries';

const DEPLOYMENT_PAGE_SIZE = 10;

export function ResourceDetailDialog({ id, open, onOpenChange }: { id: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data, isPending } = useAdminBinaryResource(id);
  const [page, setPage] = React.useState(1);
  const [statusFilter, setStatusFilter] = React.useState<'ALL' | BinaryDeploymentStatus>('ALL');
  const deploymentsQuery = useBinaryResourceDeployments(id, page, statusFilter === 'ALL' ? undefined : statusFilter);
  const { retryDeployment } = useBinaryResourceMutations();

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent size="wide">
        <DialogHeader>
          <DialogTitle>资源详情</DialogTitle>
          <DialogDescription>
            {data ? `${data.kind === 'SINGBOX' ? 'Sing-box' : 'Agent'} · ${data.version}` : '加载资源信息'}
          </DialogDescription>
        </DialogHeader>
        {isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : data ? (
          <div className="min-w-0 space-y-5">
            <div className="grid gap-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-muted-foreground">来源</p>
                <p className="font-medium">{sourceLabel(data.source)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">状态</p>
                <Badge variant={data.status === 'ACTIVE' ? 'default' : data.status === 'RETIRED' ? 'destructive' : 'secondary'}>
                  {BINARY_STATUS_LABELS[data.status]}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground">默认</p>
                <p className="font-medium">{data.isDefault ? '是' : '否'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">分发任务</p>
                <p className="font-medium">{data.deploymentCount ?? data.deploymentTasks?.length ?? 0} 次</p>
              </div>
            </div>

            {data.notes ? (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <p className="text-xs text-muted-foreground">备注</p>
                <p className="mt-1 whitespace-pre-wrap break-words">{data.notes}</p>
              </div>
            ) : null}

            <div>
              <h3 className="text-sm font-semibold">兼容性约束</h3>
              {compatibilityEntries(data.compatibilityJson).length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {compatibilityEntries(data.compatibilityJson).map(([key, value]) => (
                    <Badge key={key} variant="outline" className="text-xs">
                      {BINARY_COMPATIBILITY_LABELS[key] ?? key}：{String(value)}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">未设置约束，所有节点均可分发。</p>
              )}
            </div>

            <Separator />

            <div className="min-w-0 space-y-3">
              <h3 className="text-sm font-semibold">平台资产</h3>
              {data.assets.map((asset) => (
                <div key={asset.id} className="min-w-0 overflow-hidden rounded-md border p-3">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <span className="min-w-0 break-words font-medium">{asset.target}</span>
                    <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{bytes(asset.size)}</span>
                  </div>
                  <p className="mt-1 break-all font-mono text-[11px] leading-4 text-muted-foreground" title={asset.sha256}>{asset.sha256}</p>
                  <div className="mt-2 min-w-0 space-y-1 text-xs text-muted-foreground">
                    {(asset.files ?? []).map((file) => (
                      <div key={file.id} className="flex min-w-0 flex-wrap justify-between gap-x-2 gap-y-1">
                        <span className="min-w-0 break-words">{file.role === 'auxiliary' ? '辅助' : '主文件'} · {file.name}</span>
                        <span className="break-all font-mono text-right">{file.sha256}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">分发记录</h3>
                <div className="flex items-center gap-2">
                  <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value as typeof statusFilter); setPage(1); }}>
                    <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">全部状态</SelectItem>
                      <SelectItem value="QUEUED">排队中</SelectItem>
                      <SelectItem value="DISPATCHED">已下发</SelectItem>
                      <SelectItem value="COMPLETED">已完成</SelectItem>
                      <SelectItem value="FAILED">失败</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {deploymentsQuery.isPending ? (
                <Skeleton className="h-24 w-full" />
              ) : (deploymentsQuery.data?.data.length ?? 0) ? (
                <>
                  <div className="space-y-2">
                    {deploymentsQuery.data!.data.map((task) => (
                      <div key={task.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs">
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="min-w-0 break-words font-medium">{task.node?.name ?? task.nodeId}</span>
                            <Badge variant="outline" className="text-[10px]">{operationLabel(task.operation)}</Badge>
                            <Badge variant={deploymentBadgeVariant(task.status)}>
                              {BINARY_DEPLOYMENT_STATUS_LABELS[task.status] ?? task.status}
                            </Badge>
                            <span className="text-muted-foreground">尝试 {task.attempts} 次</span>
                          </div>
                          {task.errorMessage ? (
                            <p className="break-all text-destructive" title={task.errorMessage}>{task.errorMessage}</p>
                          ) : null}
                          <p className="text-muted-foreground">请求于 {formatDateTime(task.requestedAt)}{task.completedAt ? ` · 完成于 ${formatDateTime(task.completedAt)}` : ''}</p>
                        </div>
                        {task.status === 'FAILED' || task.status === 'COMPLETED' ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="icon"
                                className="size-7"
                                aria-label="重试该分发任务"
                                disabled={retryDeployment.isPending}
                                onClick={() => retryDeployment.mutate({ nodeId: task.node?.id ?? task.nodeId, taskId: task.id })}
                              >
                                {retryDeployment.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>重新下发该升级任务</TooltipContent>
                          </Tooltip>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>共 {deploymentsQuery.data!.total} 条</span>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="h-7" disabled={page <= 1} onClick={() => setPage((prev) => prev - 1)}>上一页</Button>
                      <span>第 {deploymentsQuery.data!.page} / {Math.max(1, Math.ceil(deploymentsQuery.data!.total / DEPLOYMENT_PAGE_SIZE))} 页</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7"
                        disabled={page >= Math.ceil(deploymentsQuery.data!.total / DEPLOYMENT_PAGE_SIZE)}
                        onClick={() => setPage((prev) => prev + 1)}
                      >
                        下一页
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <EmptyState title="暂无分发记录" description="该资源尚未产生节点升级任务。" className="border-0" />
              )}
            </div>
          </div>
        ) : (
          <EmptyState title="资源不存在" description="资源可能已经被删除或移除。" />
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
