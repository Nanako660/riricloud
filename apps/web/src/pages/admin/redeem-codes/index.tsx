import { useEffect, useState } from 'react';
import { Download, Eraser, Eye, EyeOff, Plus, Search, Ticket, Trash2 } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { EmptyState } from '@/components/shared/empty-state';
import { CopyButton } from '@/components/shared/copy-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Pagination, PaginationInfo, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/shared/responsive-dialog';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { GenerateDialog } from './components/generate-dialog';
import { RedeemStatsCards } from './components/stats-cards';
import { maskRedeemCode, useRedeemCodeMutations, useRedeemCodeStats, useRedeemCodes, type AdminRedeemCode, type RedeemCodeStatus } from './use-redeem-codes';

const labels: Record<RedeemCodeStatus, string> = { UNUSED: '未使用', REDEEMED: '已兑换', REVOKED: '已作废', EXPIRED: '已过期' };
const PAGE_SIZE = 20;

export default function RedeemCodesPage() {
  const [status, setStatus] = useState<RedeemCodeStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [revealed, setRevealed] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [generateOpen, setGenerateOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<AdminRedeemCode | null>(null);
  const [batchRevokeOpen, setBatchRevokeOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => { setPage(1); setSelectedIds(new Set()); }, [status, debouncedSearch]);

  const query = useRedeemCodes({ page, pageSize: PAGE_SIZE, status, search: debouncedSearch });
  const stats = useRedeemCodeStats();
  const { batch, revoke, batchRevoke, cleanup, exportCodes } = useRedeemCodeMutations({ status: status === 'ALL' ? undefined : status, search: debouncedSearch || undefined });

  const rows = query.data?.data ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const unusedRows = rows.filter((row) => row.status === 'UNUSED');
  const allPageSelected = unusedRows.length > 0 && unusedRows.every((row) => selectedIds.has(row.id));
  const codesText = generatedCodes.join('\n');

  const toggleRow = (row: AdminRedeemCode) => setSelectedIds((prev) => { const next = new Set(prev); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next; });
  const toggleAllPage = () => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (allPageSelected) unusedRows.forEach((row) => next.delete(row.id));
    else unusedRows.forEach((row) => next.add(row.id));
    return next;
  });

  return (
    <PageContainer>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><PageHeader title="卡密管理" description="生成充值卡密、查看兑换状态并作废未使用卡密。" /><Button className="w-full sm:w-auto" onClick={() => setGenerateOpen(true)}><Plus />批量生成</Button></div>
      <RedeemStatsCards stats={stats.data} isLoading={stats.isLoading} />
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="搜索卡密…" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
                <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">全部状态</SelectItem>
                  {Object.entries(labels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="outline" size="icon" aria-label={revealed ? '隐藏卡密明文' : '显示卡密明文'} onClick={() => setRevealed((value) => !value)}>
                    {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{revealed ? '隐藏卡密明文' : '显示卡密明文'}</TooltipContent>
              </Tooltip>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button type="button" variant="outline" disabled={exportCodes.isPending}><Download className="size-4" />导出</Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => exportCodes.mutate('csv')}>导出 CSV（含审计字段）</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportCodes.mutate('txt')}>导出 TXT（仅卡密）</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button type="button" variant="outline" onClick={() => setCleanupOpen(true)}><Eraser className="size-4" />清理过期</Button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Ticket className="size-4" />充值卡密金额以人民币元展示，服务端按分保存；列表默认掩码显示卡密。</div>
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
              <span>已选中 <span className="font-semibold text-foreground">{selectedIds.size}</span> 张未使用卡密</span>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="destructive" onClick={() => setBatchRevokeOpen(true)}><Trash2 className="size-4" />批量作废</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>取消选择</Button>
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"><Checkbox checked={allPageSelected} onCheckedChange={toggleAllPage} aria-label="全选本页未使用卡密" disabled={unusedRows.length === 0} /></TableHead>
                  <TableHead>卡密</TableHead>
                  <TableHead>面额</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>有效期</TableHead>
                  <TableHead>兑换人</TableHead>
                  <TableHead>兑换时间</TableHead>
                  <TableHead>备注</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((item) => (
                  <TableRow key={item.id} data-state={selectedIds.has(item.id) ? 'selected' : undefined}>
                    <TableCell>{item.status === 'UNUSED' && <Checkbox checked={selectedIds.has(item.id)} onCheckedChange={() => toggleRow(item)} aria-label={`选择卡密 ${item.id}`} />}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <code className="whitespace-nowrap text-xs">{revealed ? item.code : maskRedeemCode(item.code)}</code>
                        {revealed && <CopyButton value={item.code} className="h-6 px-2 text-xs" />}
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums">{formatCurrency(item.amount)}</TableCell>
                    <TableCell><Badge variant={item.status === 'REDEEMED' ? 'secondary' : item.status === 'UNUSED' ? 'default' : 'destructive'}>{labels[item.status]}</Badge></TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{item.expiresAt ? formatDateTime(item.expiresAt) : '永久'}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{item.redeemedBy ? item.redeemedBy.nickname || item.redeemedBy.email : '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{item.redeemedAt ? formatDateTime(item.redeemedAt) : '—'}</TableCell>
                    <TableCell>{item.note || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(item.createdAt)}</TableCell>
                    <TableCell className="text-right">{item.status === 'UNUSED' && <Button variant="ghost" size="icon" aria-label="作废卡密" onClick={() => setRevokeTarget(item)}><Trash2 className="size-4 text-destructive" /></Button>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {!rows.length && <EmptyState title={query.isPending ? '加载中…' : '暂无卡密'} description={query.isPending ? '正在获取卡密数据。' : '生成充值卡密后会显示在这里。'} />}
          {rows.length > 0 && (
            <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
              <div>共 <span className="font-semibold text-foreground font-mono">{total.toLocaleString()}</span> 条记录</div>
              <Pagination>
                <PaginationPrevious onClick={() => setPage((value) => Math.max(value - 1, 1))} disabled={page <= 1} />
                <PaginationInfo page={page} totalPages={totalPages} />
                <PaginationNext onClick={() => setPage((value) => Math.min(value + 1, totalPages))} disabled={page >= totalPages} />
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>
      <GenerateDialog open={generateOpen} onOpenChange={setGenerateOpen} pending={batch.isPending} onSubmit={(payload) => batch.mutate(payload, { onSuccess: (data) => { setGeneratedCodes(data.codes); setGenerateOpen(false); } })} />
      <ResponsiveDialog open={generatedCodes.length > 0} onOpenChange={(value) => !value && setGeneratedCodes([])}><ResponsiveDialogContent><DialogHeader><DialogTitle>生成成功</DialogTitle><DialogDescription>请复制下面的卡密并妥善分发；关闭后可在列表中查看（默认掩码显示）。</DialogDescription></DialogHeader><div className="max-h-[50vh] overflow-y-auto rounded-md border bg-muted/30 p-3"><pre className="whitespace-pre-wrap break-all font-mono text-xs leading-6">{codesText}</pre></div><DialogFooter><CopyButton value={codesText} className="w-full sm:w-auto" /><Button variant="outline" onClick={() => setGeneratedCodes([])}>关闭</Button></DialogFooter></ResponsiveDialogContent></ResponsiveDialog>
      <AlertDialog open={!!revokeTarget} onOpenChange={(value) => !value && setRevokeTarget(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>作废这张卡密？</AlertDialogTitle><AlertDialogDescription>{revokeTarget?.code} 作废后无法兑换，且不可恢复。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { if (revokeTarget) revoke.mutate(revokeTarget.id, { onSuccess: () => { setRevokeTarget(null); setSelectedIds(new Set()); } }); }}>确认作废</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={batchRevokeOpen} onOpenChange={setBatchRevokeOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>批量作废 {selectedIds.size} 张卡密？</AlertDialogTitle><AlertDialogDescription>选中的未使用卡密将全部作废，作废后无法兑换且不可恢复。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={batchRevoke.isPending} onClick={() => batchRevoke.mutate([...selectedIds], { onSuccess: () => { setBatchRevokeOpen(false); setSelectedIds(new Set()); } })}>{batchRevoke.isPending ? '作废中…' : '确认作废'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={cleanupOpen} onOpenChange={setCleanupOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>清理过期卡密？</AlertDialogTitle><AlertDialogDescription>将删除已过期超过 30 天且仍未使用的卡密（当前过期未使用共 {stats.data?.byStatus.EXPIRED.count ?? 0} 张）。已兑换与已作废记录会保留用于审计，删除后不可恢复。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={cleanup.isPending} onClick={() => cleanup.mutate(30, { onSuccess: () => setCleanupOpen(false) })}>{cleanup.isPending ? '清理中…' : '确认清理'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </PageContainer>
  );
}
