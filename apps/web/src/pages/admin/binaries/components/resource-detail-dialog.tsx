import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/shared/responsive-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/utils';
import {
  BINARY_COMPATIBILITY_LABELS,
  BINARY_DEPLOYMENT_STATUS_LABELS,
  BINARY_STATUS_LABELS,
  bytes,
  compatibilityEntries,
  deploymentBadgeVariant,
  operationLabel,
  sourceLabel,
  totalAssetBytes
} from '../binary-labels';
import {
  useAdminBinaryResource,
  useBinaryResourceDeployments,
  useBinaryResourceMutations,
  type BinaryDeploymentStatus
} from '../use-binaries';

const DEPLOYMENT_PAGE_SIZE = 10;

export function ResourceDetailDialog({ id, open, onOpenChange }: { id: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation(['admin', 'common']);
  const { data, isPending } = useAdminBinaryResource(id);
  const [page, setPage] = React.useState(1);
  const [statusFilter, setStatusFilter] = React.useState<'ALL' | BinaryDeploymentStatus>('ALL');
  const deploymentsQuery = useBinaryResourceDeployments(id, page, statusFilter === 'ALL' ? undefined : statusFilter);
  const { retryDeployment } = useBinaryResourceMutations();

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent size="wide">
        <DialogHeader>
          <DialogTitle>{t('admin:binaries.detailTitle')}</DialogTitle>
          <DialogDescription>
            {data ? `${t('admin:binaries.kindAgent')} · ${data.version}` : t('admin:binaries.detailLoading')}
          </DialogDescription>
        </DialogHeader>
        {isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : data ? (
          <div className="min-w-0 space-y-5">
            <div className="grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
              <div>
                <p className="text-muted-foreground">{t('admin:binaries.labelSource')}</p>
                <p className="font-medium">{sourceLabel(data.source)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t('admin:binaries.labelStatus')}</p>
                <Badge variant={data.status === 'ACTIVE' ? 'default' : 'secondary'}>
                  {BINARY_STATUS_LABELS[data.status]}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground">{t('admin:binaries.labelDefault')}</p>
                <p className="font-medium">{data.isDefault ? t('admin:binaries.yes') : t('admin:binaries.no')}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t('admin:binaries.labelDeployments')}</p>
                <p className="font-medium">{t('admin:binaries.deploymentTimes', { count: data.deploymentCount ?? data.deploymentTasks?.length ?? 0 })}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t('admin:binaries.labelRegisteredSize')}</p>
                <p className="font-medium tabular-nums">{totalAssetBytes(data.assets)}</p>
              </div>
            </div>

            {data.notes ? (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <p className="text-xs text-muted-foreground">{t('admin:binaries.labelNotes')}</p>
                <p className="mt-1 whitespace-pre-wrap break-words">{data.notes}</p>
              </div>
            ) : null}

            <div>
              <h3 className="text-sm font-semibold">{t('admin:binaries.labelCompatibility')}</h3>
              {compatibilityEntries(data.compatibilityJson).length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {compatibilityEntries(data.compatibilityJson).map(([key, value]) => (
                    <Badge key={key} variant="outline" className="text-xs">
                      {BINARY_COMPATIBILITY_LABELS[key] ?? key}: {String(value)}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">{t('admin:binaries.noCompatConstraint')}</p>
              )}
            </div>

            <Separator />

            <div className="min-w-0 space-y-3">
              <h3 className="text-sm font-semibold">{t('admin:binaries.labelAssets')}</h3>
              {data.assets.map((asset) => (
                <div key={asset.id} className="min-w-0 overflow-hidden rounded-md border p-3">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <span className="flex min-w-0 flex-wrap items-center gap-1.5 break-words font-medium">
                      {asset.target}
                      {asset.available === false ? (
                        <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="mr-1 size-3" />{t('admin:binaries.assetUnavailable')}
                        </Badge>
                      ) : null}
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{bytes(asset.size)}</span>
                  </div>
                  {(asset.files ?? []).length ? (
                    <div className="mt-2 min-w-0 space-y-1 text-xs text-muted-foreground">
                      {(asset.files ?? []).map((file) => (
                        <div key={file.id} className="flex min-w-0 flex-wrap justify-between gap-x-2 gap-y-1">
                          <span className="min-w-0 break-words">{file.role === 'auxiliary' ? t('admin:binaries.fileAuxiliary') : t('admin:binaries.filePrimary')} · {file.name}</span>
                          <span className="break-all font-mono text-right">{file.sha256}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 break-all font-mono text-[11px] leading-4 text-muted-foreground" title={asset.sha256}>{asset.sha256}</p>
                  )}
                </div>
              ))}
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{t('admin:binaries.labelRecords')}</h3>
                <div className="flex items-center gap-2">
                  <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value as typeof statusFilter); setPage(1); }}>
                    <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">{t('admin:binaries.allStatuses')}</SelectItem>
                      <SelectItem value="QUEUED">{t('admin:binaries.deployQueued')}</SelectItem>
                      <SelectItem value="DISPATCHED">{t('admin:binaries.deployDispatched')}</SelectItem>
                      <SelectItem value="COMPLETED">{t('admin:binaries.deployCompleted')}</SelectItem>
                      <SelectItem value="FAILED">{t('admin:binaries.deployFailed')}</SelectItem>
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
                            <span className="text-muted-foreground">{t('admin:binaries.taskAttempts', { count: task.attempts })}</span>
                          </div>
                          {task.errorMessage ? (
                            <p className="break-all text-destructive" title={task.errorMessage}>{task.errorMessage}</p>
                          ) : null}
                          <p className="text-muted-foreground">
                            {t('admin:binaries.taskRequestedAt', { time: formatDateTime(task.requestedAt) })}
                            {task.completedAt ? ` · ${t('admin:binaries.taskCompletedAt', { time: formatDateTime(task.completedAt) })}` : ''}
                          </p>
                        </div>
                        {task.status === 'FAILED' || task.status === 'COMPLETED' ? (
                          <IconButton
                            variant="outline"
                            size="icon-xs"
                            aria-label={t('admin:binaries.retryTaskAria')}
                            tooltip={t('admin:binaries.retryTaskTooltip')}
                            disabled={retryDeployment.isPending}
                            onClick={() => retryDeployment.mutate({ nodeId: task.node?.id ?? task.nodeId, taskId: task.id })}
                          >
                            {retryDeployment.isPending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                          </IconButton>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{t('admin:binaries.totalDeployments', { total: deploymentsQuery.data!.total })}</span>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="h-7" disabled={page <= 1} onClick={() => setPage((prev) => prev - 1)}>
                        {t('common:table.previous')}
                      </Button>
                      <span>
                        {t('admin:binaries.pagination', {
                          current: deploymentsQuery.data!.page,
                          total: Math.max(1, Math.ceil(deploymentsQuery.data!.total / DEPLOYMENT_PAGE_SIZE))
                        })}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7"
                        disabled={page >= Math.ceil(deploymentsQuery.data!.total / DEPLOYMENT_PAGE_SIZE)}
                        onClick={() => setPage((prev) => prev + 1)}
                      >
                        {t('common:table.next')}
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <EmptyState title={t('admin:binaries.emptyDeploymentsTitle')} description={t('admin:binaries.emptyDeploymentsDesc')} className="border-0" />
              )}
            </div>
          </div>
        ) : (
          <EmptyState title={t('admin:binaries.resourceNotFoundTitle')} description={t('admin:binaries.resourceNotFoundDesc')} />
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
