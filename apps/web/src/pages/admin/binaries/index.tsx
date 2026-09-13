import * as React from 'react';
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
import { ASSET_UNAVAILABLE_LABEL, bytes, BINARY_STATUS_LABELS, formatTargetBadge, sourceLabel, totalAssetBytes } from './binary-labels';
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
    ? `${confirmRequest.action === 'delete' ? '删除' : '归档'} ${confirmRequest.ids.length} 项资源？`
    : '';
  const confirmDescription = confirmRequest?.action === 'delete'
    ? '仅无分发历史的非内置资源会被删除；删除会同时清理服务端文件且不可恢复。有分发历史或启用中的资源将被跳过并提示原因。'
    : '归档后不会再被选择用于新的升级任务，历史分发记录会保留。';

  return (
    <PageContainer>
      <PageHeader title="资源管理" description="独立管理 Agent 与 Sing-box 的可分发版本。" />

      <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative w-full min-w-0 flex-1 sm:min-w-52 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="搜索版本号或备注…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={kind} onValueChange={(value) => { setKind(value as typeof kind); resetPageAndSelection(); }}>
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue placeholder="资源类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部类型</SelectItem>
              <SelectItem value="AGENT">Agent</SelectItem>
              <SelectItem value="SINGBOX">Sing-box</SelectItem>
            </SelectContent>
          </Select>
          <Select value={platform} onValueChange={(value) => { setPlatform(value); resetPageAndSelection(); }}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder="平台" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部平台</SelectItem>
              {platformOptions.map((item) => (
                <SelectItem key={item} value={item}>{item}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(value) => { setStatus(value as typeof status); resetPageAndSelection(); }}>
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部状态</SelectItem>
              {(['DRAFT', 'ACTIVE', 'DISABLED', 'RETIRED'] as const).map((item) => (
                <SelectItem key={item} value={item}>{BINARY_STATUS_LABELS[item]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:flex-nowrap lg:w-auto">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => setAuditOpen(true)}>
            <History className="mr-1.5 h-4 w-4" />操作审计
          </Button>
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => setFormMode('import')}>
            <PackageOpen className="mr-1.5 h-4 w-4" />远程导入
          </Button>
          <Button className="w-full sm:w-auto" onClick={() => setFormMode('upload')}>
            <FileUp className="mr-1.5 h-4 w-4" />上传文件
          </Button>
        </div>
      </div>

      {selectedIds.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">已选 {selectedIds.size} 项</span>
          <div className="flex flex-wrap gap-1.5">
            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" disabled={mutations.batchResources.isPending}
              onClick={() => runBatch('activate', [...selectedIds])}>
              <Power className="size-3.5 text-emerald-600" />批量启用
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" disabled={mutations.batchResources.isPending}
              onClick={() => runBatch('disable', [...selectedIds])}>
              <XCircle className="size-3.5 text-amber-600" />批量停用
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" disabled={mutations.batchResources.isPending}
              onClick={() => setConfirmRequest({ action: 'retire', ids: [...selectedIds] })}>
              <Archive className="size-3.5" />批量归档
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs text-destructive" disabled={mutations.batchResources.isPending}
              onClick={() => setConfirmRequest({ action: 'delete', ids: [...selectedIds] })}>
              <Trash2 className="size-3.5" />批量删除
            </Button>
          </div>
          <Button variant="ghost" size="sm" className="ml-auto h-8 text-xs" onClick={() => setSelectedIds(new Set())}>
            取消选择
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
            <EmptyState title="无法加载资源" description="请稍后刷新重试。" className="border-0" />
          ) : rows.length ? (
            <Table className="min-w-[960px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label="全选本页资源"
                      checked={allVisibleSelected}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="w-[26%]">资源与版本</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="w-[24%]">平台资产覆盖</TableHead>
                  <TableHead>总体积</TableHead>
                  <TableHead>引用分发</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((item) => (
                  <TableRow key={item.id} data-state={selectedIds.has(item.id) ? 'selected' : undefined}>
                    <TableCell>
                      <Checkbox
                        aria-label={`选择资源 ${item.version}`}
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
                              <Star className="mr-1 size-3" />默认
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {sourceLabel(item.source)} · {item.assets.length} 个架构资产
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
                            {asset.available === false ? <TooltipContent>文件缺失或校验不符，已不可分发</TooltipContent> : null}
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
                              <div className="font-medium text-foreground">支持平台及体积：</div>
                              {item.assets.map((asset) => (
                                <div key={asset.id} className="flex justify-between gap-3 text-muted-foreground">
                                  <span>{asset.target}{asset.available === false ? `（${ASSET_UNAVAILABLE_LABEL}）` : ''}</span>
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
                      {item.deploymentCount ?? 0} 次
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="查看资源详情" onClick={() => setDetailId(item.id)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>查看详情与分发记录</TooltipContent>
                        </Tooltip>

                        {item.status === 'DRAFT' || item.status === 'DISABLED' ? (
                          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs"
                            onClick={() => mutations.activate.mutate(item.id)}
                            disabled={mutations.activate.isPending}>
                            <Power className="h-3.5 w-3.5 text-emerald-600" />
                            启用
                          </Button>
                        ) : null}

                        {item.status === 'ACTIVE' ? (
                          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs"
                            onClick={() => mutations.disable.mutate(item.id)}
                            disabled={mutations.disable.isPending}>
                            <XCircle className="h-3.5 w-3.5 text-amber-600" />
                            停用
                          </Button>
                        ) : null}

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="更多操作">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditing(item)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              编辑备注与兼容性
                            </DropdownMenuItem>
                            {item.status === 'ACTIVE' && !item.isDefault ? (
                              <DropdownMenuItem onClick={() => mutations.setDefault.mutate(item.id)} disabled={mutations.setDefault.isPending}>
                                <Star className="mr-2 h-4 w-4" />
                                设为默认版本
                              </DropdownMenuItem>
                            ) : null}
                            {item.status === 'RETIRED' ? (
                              <DropdownMenuItem onClick={() => mutations.restore.mutate(item.id)} disabled={mutations.restore.isPending}>
                                <RotateCcw className="mr-2 h-4 w-4" />
                                从归档恢复
                              </DropdownMenuItem>
                            ) : null}
                            {item.status !== 'RETIRED' ? (
                              <DropdownMenuItem onClick={() => setConfirmRequest({ action: 'retire', ids: [item.id] })}>
                                <Archive className="mr-2 h-4 w-4" />
                                归档资源
                              </DropdownMenuItem>
                            ) : null}
                            {item.status !== 'ACTIVE' && item.source !== 'BUILTIN' ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmRequest({ action: 'delete', ids: [item.id] })}>
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  删除资源
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
              title={debouncedSearch ? '没有匹配资源' : '暂无资源'}
              description={debouncedSearch ? '请尝试调整搜索关键词或筛选条件。' : '上传或导入一个资源开始管理。'}
              className="border-0"
            />
          )}
        </CardContent>
      </Card>

      {data && data.total > 0 ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>共 {data.total} 项资源</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7" disabled={page <= 1} onClick={() => { setPage((prev) => prev - 1); setSelectedIds(new Set()); }}>
              上一页
            </Button>
            <span>第 {data.page} / {Math.max(1, Math.ceil(data.total / PAGE_SIZE))} 页</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7"
              disabled={page >= Math.ceil(data.total / PAGE_SIZE)}
              onClick={() => { setPage((prev) => prev + 1); setSelectedIds(new Set()); }}
            >
              下一页
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
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (confirmRequest) runBatch(confirmRequest.action, confirmRequest.ids);
              }}
            >
              {confirmRequest?.action === 'delete' ? '确认删除' : '确认归档'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
