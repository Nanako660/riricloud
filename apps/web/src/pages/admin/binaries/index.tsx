import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CloudDownload,
  Eye,
  FileUp,
  MoreHorizontal,
  Pencil,
  Power,
  Search,
  Star,
  Trash2,
  XCircle
} from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { bytes, BINARY_STATUS_LABELS, formatTargetBadge, sourceLabel, totalAssetBytes } from './binary-labels';
import { ResourceFormDialog, type ResourceFormSubmitValue } from './components/resource-form-dialog';
import { ResourceEditDialog } from './components/resource-edit-dialog';
import { ResourceDetailDialog } from './components/resource-detail-dialog';
import { GithubReleaseDialog } from './components/github-release-dialog';
import {
  useAdminBinaryResources,
  useBinaryResourceMutations,
  type BinaryBatchAction,
  type BinaryResource,
  type BinaryStatus
} from './use-binaries';

const PAGE_SIZE = 20;

export default function BinariesPage() {
  const { t } = useTranslation(['admin', 'common']);
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [platform, setPlatform] = React.useState('ALL');
  const [status, setStatus] = React.useState<'ALL' | BinaryStatus>('ALL');
  const [page, setPage] = React.useState(1);
  const [selectedIds, setSelectedIds] = React.useState<ReadonlySet<string>>(new Set());
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [remoteOpen, setRemoteOpen] = React.useState(false);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<BinaryResource | null>(null);
  const [deleteIds, setDeleteIds] = React.useState<string[] | null>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isPending, isError } = useAdminBinaryResources({
    page,
    pageSize: PAGE_SIZE,
    search: debouncedSearch || undefined,
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
      {
        onSuccess: (result) => {
          if (result.succeeded > 0) setSelectedIds(new Set());
          setDeleteIds(null);
        }
      }
    );
  };

  const submitUploadForm = (value: ResourceFormSubmitValue) => {
    if (!value.files?.length) return;
    mutations.uploadResource.mutate(
      {
        files: value.files,
        upstreamVersion: value.upstreamVersion,
        target: value.target,
        notes: value.notes
      },
      { onSuccess: () => setUploadOpen(false) }
    );
  };

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
              {(['ACTIVE', 'DISABLED'] as const).map((item) => (
                <SelectItem key={item} value={item}>{BINARY_STATUS_LABELS[item]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:flex-nowrap lg:w-auto">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => setRemoteOpen(true)}>
            <CloudDownload className="mr-1.5 h-4 w-4" />{t('admin:binaries.remoteImportBtn')}
          </Button>
          <Button className="w-full sm:w-auto" onClick={() => setUploadOpen(true)}>
            <FileUp className="mr-1.5 h-4 w-4" />{t('admin:binaries.uploadFile')}
          </Button>
        </div>
      </div>

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
            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs text-destructive" disabled={mutations.batchResources.isPending}
              onClick={() => setDeleteIds([...selectedIds])}>
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
                {rows.map((item) => {
                  const isActive = item.status === 'ACTIVE';
                  const statusMutating = mutations.activate.isPending || mutations.disable.isPending;

                  return (
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
                              {t('admin:binaries.kindAgent')} · {item.version}
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
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={isActive}
                            disabled={statusMutating}
                            aria-label={t('admin:binaries.toggleStatusAria', { version: item.version })}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                mutations.activate.mutate(item.id);
                              } else {
                                mutations.disable.mutate(item.id);
                              }
                            }}
                          />
                          <span className={`text-xs ${isActive ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                            {BINARY_STATUS_LABELS[isActive ? 'ACTIVE' : 'DISABLED']}
                          </span>
                        </div>
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
                                    <span>{asset.target}{asset.available === false ? ` (${t('admin:binaries.assetUnavailable')})` : ''}</span>
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
                          <IconButton
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('admin:binaries.details')}
                            onClick={() => setDetailId(item.id)}
                          >
                            <Eye className="size-4" />
                          </IconButton>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <IconButton variant="ghost" size="icon-sm" aria-label={t('admin:binaries.colActions')}>
                                <MoreHorizontal className="h-4 w-4" />
                              </IconButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setEditing(item)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                {t('admin:binaries.editCompat')}
                              </DropdownMenuItem>
                              {isActive && !item.isDefault ? (
                                <DropdownMenuItem onClick={() => mutations.setDefault.mutate(item.id)} disabled={mutations.setDefault.isPending}>
                                  <Star className="mr-2 h-4 w-4" />
                                  {t('admin:binaries.setDefault')}
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteIds([item.id])}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                {t('admin:binaries.deleteResource')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
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
        mode="upload"
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onSubmit={submitUploadForm}
        pending={mutations.uploadResource.isPending}
        supportedTargets={supportedTargets}
      />

      <GithubReleaseDialog
        open={remoteOpen}
        onOpenChange={setRemoteOpen}
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

      <AlertDialog open={!!deleteIds} onOpenChange={(open) => !open && setDeleteIds(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteIds ? t('admin:binaries.confirmDeleteTitle', { count: deleteIds.length }) : ''}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('admin:binaries.confirmDeleteDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteIds) runBatch('delete', deleteIds);
              }}
            >
              {t('common:actions.confirmDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

