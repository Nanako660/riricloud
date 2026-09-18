import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, AlertTriangle, Eye, FileUp, History, MoreHorizontal, PackageOpen, Pencil, Power, RotateCcw, Search, Star, Trash2, XCircle } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { bytes, BINARY_STATUS_LABELS, formatTargetBadge, sourceLabel, totalAssetBytes } from './binary-labels';
import { ResourceFormDialog } from './components/resource-form-dialog';
import { ResourceEditDialog } from './components/resource-edit-dialog';
import { ResourceDetailDialog } from './components/resource-detail-dialog';
import { BinaryAuditDialog } from './components/binary-audit-dialog';
import {
  useAdminBinaryResources,
  useBinaryResourceMutations,
  type BinaryBatchAction,
  type BinaryKind,
  type BinaryResource,
  type BinaryStatus
} from './use-binaries';

const PAGE_SIZE = 20;

type ConfirmRequest = { action: Extract<BinaryBatchAction, 'retire' | 'delete'>; ids: string[] } | null;

function statusBadgeVariant(status: BinaryStatus) {
  if (status === 'ACTIVE') return 'default' as const;
  if (status === 'RETIRED') return 'destructive' as const;
  return 'secondary' as const;
}

export default function BinariesPage() {
  const { t } = useTranslation(['admin', 'common']);
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [kind, setKind] = React.useState<'ALL' | BinaryKind>('ALL');
  const [platform, setPlatform] = React.useState('ALL');
  const [status, setStatus] = React.useState<'ALL' | BinaryStatus>('ALL');
  const [page, setPage] = React.useState(1);
  const [selectedIds, setSelectedIds] = React.useState<ReadonlySet<string>>(new Set());
  const [formMode, setFormMode] = React.useState<'upload' | 'import' | null>(null);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<BinaryResource | null>(null);
  const [auditOpen, setAuditOpen] = React.useState(false);
  const [confirmRequest, setConfirmRequest] = React.useState<ConfirmRequest>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isPending, isError } = useAdminBinaryResources({
    page,
    pageSize: PAGE_SIZE,
    search: debouncedSearch || undefined,
    kind: kind === 'ALL' ? undefined : kind,
    status: status === 'ALL' ? undefined : status,
    platform: platform === 'ALL' ? undefined : platform
  });
  const mutations = useBinaryResourceMutations();
  const rows = data?.data ?? [];
  const supportedTargets = data?.supportedTargets;
  const platformOptions = React.useMemo(
    () => [...new Set((supportedTargets ?? []).map((target) => target.split('-').slice(1).join('-')))],
    [supportedTargets]
  );

  const resetPageAndSelection = () => {
    setPage(1);
    setSelectedIds(new Set());
  };

  const allVisibleSelected = rows.length > 0 && rows.every((item) => selectedIds.has(item.id));
  const toggleSelectAll = () => {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(rows.map((item) => item.id)));
  };
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runBatch = (action: BinaryBatchAction, ids: string[]) => {
    if (!ids.length) return;
    mutations.batchResources.mutate(
      { action, ids },
      { onSuccess: (result) => { if (result.succeeded > 0) setSelectedIds(new Set()); setConfirmRequest(null); } }
    );
  };

  const submitResourceForm = (value: { file?: File; kind: BinaryKind; upstreamVersion: string; revision: number; target: string; filename?: string; url?: string; sha256: string }) => {
    if (formMode === 'upload' && value.file) mutations.uploadResource.mutate({ ...value, file: value.file });
    if (formMode === 'import' && value.url) mutations.importResource.mutate({ ...value, url: value.url });
    setFormMode(null);
  };

  const confirmTitle = confirmRequest
    ? (confirmRequest.action === 'delete'
      ? t('admin:binaries.confirmDeleteTitle', { count: confirmRequest.ids.length })
      : t('admin:binaries.confirmRetireTitle', { count: confirmRequest.ids.length }))
    : '';
  const confirmDescription = confirmRequest?.action === 'delete'
    ? t('admin:binaries.confirmDeleteDesc')
    : t('admin:binaries.confirmRetireDesc');

  return (
    <PageContainer>
      <PageHeader title={t('admin:binaries.title')} description={t('admin:binaries.subtitle')} />

      <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative w-full min-w-0 flex-1 sm:min-w-52 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder={t('admin:binaries.searchPlaceholder')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={kind} onValueChange={(value) => { setKind(value as typeof kind); resetPageAndSelection(); }}>
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue placeholder={t('admin:binaries.filterKind')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('admin:binaries.allKinds')}</SelectItem>
              <SelectItem value="AGENT">Agent</SelectItem>
              <SelectItem value="SINGBOX">Sing-box</SelectItem>
            </SelectContent>
          </Select>
          <Select value={platform} onValueChange={(value) => { setPlatform(value); resetPageAndSelection(); }}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder={t('admin:binaries.filterPlatform')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('admin:binaries.allPlatforms')}</SelectItem>
              {platformOptions.map((item) => (
                <SelectItem key={item} value={item}>{item}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(value) => { setStatus(value as typeof status); resetPageAndSelection(); }}>
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue placeholder={t('admin:binaries.filterStatus')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('admin:binaries.allStatuses')}</SelectItem>
              {(['DRAFT', 'ACTIVE', 'DISABLED', 'RETIRED'] as const).map((item) => (
                <SelectItem key={item} value={item}>{BINARY_STATUS_LABELS[item]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:flex-nowrap lg:w-auto">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => setAuditOpen(true)}>
            <History className="mr-1.5 h-4 w-4" />{t('admin:binaries.audit')}
          </Button>
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => setFormMode('import')}>
            <PackageOpen className="mr-1.5 h-4 w-4" />{t('admin:binaries.remoteImport')}
          </Button>
          <Button className="w-full sm:w-auto" onClick={() => setFormMode('upload')}>
            <FileUp className="mr-1.5 h-4 w-4" />{t('admin:binaries.uploadFile')}
          </Button>
        </div>
      </div>

      {data?.summary ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">{t('admin:binaries.registeredSize')}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{bytes(data.summary.totalBytes)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('admin:binaries.registeredSizeDesc')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">{t('admin:binaries.reclaimableSize')}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{bytes(data.summary.reclaimableBytes)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('admin:binaries.reclaimableSizeDesc')}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {selectedIds.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">{t('common:table.selectedCount', { count: selectedIds.size })}</span>
          <div className="flex flex-wrap gap-1.5">
            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" disabled={mutations.batchResources.isPending}
              onClick={() => runBatch('activate', [...selectedIds])}>
              <Power className="size-3.5 text-emerald-600" />{t('common:actions.enable')}
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" disabled={mutations.batchResources.isPending}
              onClick={() => runBatch('disable', [...selectedIds])}>
              <XCircle className="size-3.5 text-amber-600" />{t('common:actions.disable')}
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" disabled={mutations.batchResources.isPending}
              onClick={() => setConfirmRequest({ action: 'retire', ids: [...selectedIds] })}>
              <Archive className="size-3.5" />{t('admin:binaries.batchRetire')}
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs text-destructive" disabled={mutations.batchResources.isPending}
              onClick={() => setConfirmRequest({ action: 'delete', ids: [...selectedIds] })}>
              <Trash2 className="size-3.5" />{t('admin:binaries.batchDelete')}
            </Button>
          </div>
          <Button variant="ghost" size="sm" className="ml-auto h-8 text-xs" onClick={() => setSelectedIds(new Set())}>
            {t('common:actions.cancel')}
          </Button>
        </div>
      ) : null}

      <Card>
        <CardContent className="min-w-0 p-0">
          {isPending ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : isError ? (
            <EmptyState title={t('common:status.error')} description={t('common:actions.loading')} className="border-0" />
          ) : rows.length ? (
            <Table className="min-w-[960px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label={t('common:table.selectAll')}
                      checked={allVisibleSelected}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="w-[26%]">{t('admin:binaries.colResource')}</TableHead>
                  <TableHead>{t('admin:binaries.colStatus')}</TableHead>
                  <TableHead className="w-[24%]">{t('admin:binaries.colAssets')}</TableHead>
                  <TableHead>{t('admin:binaries.colSize')}</TableHead>
                  <TableHead>{t('admin:binaries.colDeployments')}</TableHead>
                  <TableHead className="text-right">{t('admin:binaries.colActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((item) => (
                  <TableRow key={item.id} data-state={selectedIds.has(item.id) ? 'selected' : undefined}>
                    <TableCell>
                      <Checkbox
                        aria-label={t('admin:binaries.selectResourceAria', { version: item.version })}
                        checked={selectedIds.has(item.id)}
                        onCheckedChange={() => toggleSelect(item.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">
                            {item.kind === 'SINGBOX' ? 'Sing-box' : 'RiriCloud Agent'} · {item.version}
                          </span>
                          {item.isDefault ? (
                            <Badge variant="outline" className="text-xs">
                              <Star className="mr-1 size-3" />{t('admin:binaries.defaultBadge')}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {sourceLabel(item.source)} · {t('admin:binaries.assetCount', { count: item.assets.length })}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(item.status)}>{BINARY_STATUS_LABELS[item.status]}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        {item.assets.slice(0, 3).map((asset) => (
                          <Tooltip key={asset.id}>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className={asset.available === false
                                  ? 'border-amber-500/40 bg-amber-500/10 font-mono text-[11px] text-amber-700 dark:text-amber-400'
                                  : 'text-[11px] font-mono'}
                              >
                                {asset.available === false ? <AlertTriangle className="mr-1 size-3" /> : null}
                                {formatTargetBadge(asset.target)}
                              </Badge>
                            </TooltipTrigger>
                            {asset.available === false ? <TooltipContent>{t('admin:binaries.assetUnavailableTooltip')}</TooltipContent> : null}
                          </Tooltip>
                        ))}
                        {item.assets.length > 3 ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="secondary" className="cursor-default text-[11px]">
                                +{item.assets.length - 3}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs space-y-1 text-xs">
                              <div className="font-medium text-foreground">{t('admin:binaries.supportedPlatformAndSize')}</div>
                              {item.assets.map((asset) => (
                                <div key={asset.id} className="flex justify-between gap-3 text-muted-foreground">
                                  <span>{asset.target}{asset.available === false ? `（${t('admin:binaries.assetUnavailable')}）` : ''}</span>
                                  <span className="font-mono">{bytes(asset.size)}</span>
                                </div>
                              ))}
                            </TooltipContent>
                          </Tooltip>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {totalAssetBytes(item.assets)}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {t('admin:binaries.deploymentTimes', { count: item.deploymentCount ?? 0 })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={t('admin:binaries.details')} onClick={() => setDetailId(item.id)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('admin:binaries.details')}</TooltipContent>
                        </Tooltip>

                        {item.status === 'DRAFT' || item.status === 'DISABLED' ? (
                          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs"
                            onClick={() => mutations.activate.mutate(item.id)}
                            disabled={mutations.activate.isPending}>
                            <Power className="h-3.5 w-3.5 text-emerald-600" />
                            {t('common:actions.enable')}
                          </Button>
                        ) : null}

                        {item.status === 'ACTIVE' ? (
                          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs"
                            onClick={() => mutations.disable.mutate(item.id)}
                            disabled={mutations.disable.isPending}>
                            <XCircle className="h-3.5 w-3.5 text-amber-600" />
                            {t('common:actions.disable')}
                          </Button>
                        ) : null}

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={t('admin:binaries.colActions')}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditing(item)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              {t('admin:binaries.editCompat')}
                            </DropdownMenuItem>
                            {item.status === 'ACTIVE' && !item.isDefault ? (
                              <DropdownMenuItem onClick={() => mutations.setDefault.mutate(item.id)} disabled={mutations.setDefault.isPending}>
                                <Star className="mr-2 h-4 w-4" />
                                {t('admin:binaries.setDefault')}
                              </DropdownMenuItem>
                            ) : null}
                            {item.status === 'RETIRED' ? (
                              <DropdownMenuItem onClick={() => mutations.restore.mutate(item.id)} disabled={mutations.restore.isPending}>
                                <RotateCcw className="mr-2 h-4 w-4" />
                                {t('admin:binaries.restoreArchived')}
                              </DropdownMenuItem>
                            ) : null}
                            {item.status !== 'RETIRED' ? (
                              <DropdownMenuItem onClick={() => setConfirmRequest({ action: 'retire', ids: [item.id] })}>
                                <Archive className="mr-2 h-4 w-4" />
                                {t('admin:binaries.retireResource')}
                              </DropdownMenuItem>
                            ) : null}
                            {item.status !== 'ACTIVE' && (item.source !== 'BUILTIN' || item.status === 'RETIRED') ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmRequest({ action: 'delete', ids: [item.id] })}>
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  {t('admin:binaries.deleteResource')}
                                </DropdownMenuItem>
                              </>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title={debouncedSearch ? t('common:table.noResults') : t('admin:binaries.emptyBinaries')}
              description={debouncedSearch ? t('admin:binaries.emptySearchDesc') : t('admin:binaries.emptyInitDesc')}
              className="border-0"
            />
          )}
        </CardContent>
      </Card>

      {data && data.total > 0 ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t('common:table.totalItems', { total: data.total })}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7" disabled={page <= 1} onClick={() => { setPage((prev) => prev - 1); setSelectedIds(new Set()); }}>
              {t('common:table.previous')}
            </Button>
            <span>{t('common:table.pageInfo', { page: data.page, totalPages: Math.max(1, Math.ceil(data.total / PAGE_SIZE)) })}</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7"
              disabled={page >= Math.ceil(data.total / PAGE_SIZE)}
              onClick={() => { setPage((prev) => prev + 1); setSelectedIds(new Set()); }}
            >
              {t('common:table.next')}
            </Button>
          </div>
        </div>
      ) : null}

      <ResourceFormDialog
        mode={formMode ?? 'upload'}
        open={formMode !== null}
        onOpenChange={(open) => !open && setFormMode(null)}
        onSubmit={submitResourceForm}
        pending={mutations.uploadResource.isPending || mutations.importResource.isPending}
        supportedTargets={supportedTargets}
      />

      {editing ? (
        <ResourceEditDialog
          resource={editing}
          open={!!editing}
          onOpenChange={(open) => !open && setEditing(null)}
          onSubmit={(value) => {
            mutations.updateResource.mutate(
              { id: editing.id, ...value },
              { onSuccess: () => setEditing(null) }
            );
          }}
          pending={mutations.updateResource.isPending}
        />
      ) : null}

      {detailId ? (
        <ResourceDetailDialog id={detailId} open={detailId !== null} onOpenChange={(open) => !open && setDetailId(null)} />
      ) : null}

      <BinaryAuditDialog open={auditOpen} onOpenChange={setAuditOpen} />

      <AlertDialog open={!!confirmRequest} onOpenChange={(open) => !open && setConfirmRequest(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (confirmRequest) runBatch(confirmRequest.action, confirmRequest.ids);
              }}
            >
              {confirmRequest?.action === 'delete' ? t('common:actions.confirmDelete') : t('common:actions.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
