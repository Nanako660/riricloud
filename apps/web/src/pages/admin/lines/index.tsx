import * as React from 'react';
import { ArrowDown, ArrowUp, Copy, GitBranch, Pencil, Plus, Search, Trash2, Zap } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { type LineStatus, type LineType } from '@/lib/api';
import { useAdminNodes } from '../nodes/use-nodes';
import { useAdminCertificates } from '../certificates/use-certificates';
import { LineFormDialog } from './components/line-form-dialog';
import { useAdminLines, useLineMutations, type AdminLine } from './use-lines';

const typeLabels: Record<LineType, string> = { DIRECT: '直连', RELAY: '中继' };
const relayLabels = { BLIND_FORWARD: '盲转发', PROTOCOL_PROXY: '协议代理' };

export default function AdminLinesPage() {
  const [search, setSearch] = React.useState('');
  const [type, setType] = React.useState<'ALL' | LineType>('ALL');
  const [status, setStatus] = React.useState<'ALL' | LineStatus>('ALL');
  const [tag, setTag] = React.useState('');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AdminLine | null>(null);
  const [deleting, setDeleting] = React.useState<AdminLine | null>(null);
  const query = React.useMemo(() => ({
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(type !== 'ALL' ? { type } : {}),
    ...(status !== 'ALL' ? { status } : {}),
    ...(tag.trim() ? { tag: tag.trim() } : {})
  }), [search, status, tag, type]);
  const { data, isPending, isError } = useAdminLines(query);
  const { data: nodes } = useAdminNodes();
  const { data: certificates } = useAdminCertificates();
  const { create, update, remove, duplicate, testResolve, batchStatus, reorder } = useLineMutations();
  const lines = data?.data ?? [];
  const allSelected = lines.length > 0 && lines.every((line) => selected.has(line.id));
  const busy = create.isPending || update.isPending;

  const toggleSelected = (id: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(lines.map((line) => line.id)) : new Set());
  };

  const move = (line: AdminLine, direction: -1 | 1) => {
    const index = lines.findIndex((item) => item.id === line.id);
    const neighbor = lines[index + direction];
    if (!neighbor) return;
    reorder.mutate([
      { id: line.id, sortOrder: neighbor.sortOrder },
      { id: neighbor.id, sortOrder: line.sortOrder }
    ]);
  };

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (line: AdminLine) => { setEditing(line); setFormOpen(true); };

  if (isPending) return <PageContainer><PageHeader title="线路管理" description="管理用户可见的直连与中继接入线路。" /><p className="text-sm text-muted-foreground">加载中…</p></PageContainer>;
  if (isError) return <PageContainer><PageHeader title="线路管理" /><EmptyState title="无法加载线路" description="请稍后刷新重试" /></PageContainer>;

  return (
    <PageContainer>
      <PageHeader title="线路管理" description="管理用户可见的直连与中继接入线路。" />
      <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative w-full min-w-0 flex-1 sm:min-w-52 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索名称或地址" className="pl-9" />
          </div>
          <Input value={tag} onChange={(event) => setTag(event.target.value)} placeholder="标签筛选" className="w-full sm:w-32" />
          <Select value={type} onValueChange={(value) => setType(value as 'ALL' | LineType)}><SelectTrigger className="w-full sm:w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">全部类型</SelectItem><SelectItem value="DIRECT">直连</SelectItem><SelectItem value="RELAY">中继</SelectItem></SelectContent></Select>
          <Select value={status} onValueChange={(value) => setStatus(value as 'ALL' | LineStatus)}><SelectTrigger className="w-full sm:w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">全部状态</SelectItem><SelectItem value="ACTIVE">已启用</SelectItem><SelectItem value="DISABLED">已禁用</SelectItem></SelectContent></Select>
        </div>
        <Button className="w-full lg:w-auto" onClick={openCreate}><Plus />新建线路</Button>
      </div>
      {selected.size > 0 && <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm"><span>已选 {selected.size} 条</span><Button size="sm" variant="outline" disabled={batchStatus.isPending} onClick={() => batchStatus.mutate({ ids: [...selected], status: 'ACTIVE' }, { onSuccess: () => setSelected(new Set()) })}>批量启用</Button><Button size="sm" variant="outline" disabled={batchStatus.isPending} onClick={() => batchStatus.mutate({ ids: [...selected], status: 'DISABLED' }, { onSuccess: () => setSelected(new Set()) })}>批量禁用</Button></div>}
      <Card>
        <CardContent className="p-0">
          {lines.length ? <Table className="min-w-[980px]">
            <TableHeader><TableRow><TableHead className="w-10"><Checkbox checked={allSelected} onCheckedChange={(checked) => toggleAll(checked === true)} aria-label="全选线路" /></TableHead><TableHead>线路</TableHead><TableHead>类型</TableHead><TableHead>接入端点</TableHead><TableHead>目标入站</TableHead><TableHead>标签 / 倍率</TableHead><TableHead>状态</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader>
            <TableBody>{lines.map((line, index) => <TableRow key={line.id}>
              <TableCell><Checkbox checked={selected.has(line.id)} onCheckedChange={(checked) => toggleSelected(line.id, checked === true)} aria-label={`选择${line.name}`} /></TableCell>
              <TableCell><div className="font-medium">{line.name}</div><div className="text-xs text-muted-foreground">Lv.{line.level}</div></TableCell>
              <TableCell><Badge variant="outline">{typeLabels[line.type]}{line.relayMode ? ` · ${relayLabels[line.relayMode]}` : ''}</Badge></TableCell>
              <TableCell className="min-w-36"><div className="font-mono text-xs">{line.serverHost}:{line.serverPort}</div><div className="text-xs text-muted-foreground">{line.endpointOverrideEnabled ? '覆盖已启用' : '复用底层设置'}</div>{line.serverName && <div className="text-xs text-muted-foreground">SNI {line.serverName}</div>}{line.host && <div className="text-xs text-muted-foreground">Host {line.host}</div>}</TableCell>
              <TableCell><div>{line.exitNode.name}</div><div className="text-xs text-muted-foreground">{line.protocolType} · 出口 {line.exitPort}</div></TableCell>
              <TableCell><div className="flex max-w-40 flex-wrap gap-1">{line.tags.map((item) => <Badge key={item} variant="secondary">#{item}</Badge>)}<Badge variant="outline">{line.trafficRate}x</Badge></div></TableCell>
              <TableCell><div className="flex flex-col items-start gap-1"><Badge variant={line.status === 'ACTIVE' ? 'default' : 'secondary'}>{line.status === 'ACTIVE' ? '启用' : '禁用'}</Badge>{!line.isPublic && <span className="text-xs text-muted-foreground">不公开</span>}</div></TableCell>
              <TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" aria-label="上移" disabled={index === 0 || reorder.isPending} onClick={() => move(line, -1)}><ArrowUp /></Button><Button variant="ghost" size="icon" aria-label="下移" disabled={index === lines.length - 1 || reorder.isPending} onClick={() => move(line, 1)}><ArrowDown /></Button><Button variant="ghost" size="icon" aria-label="测试解析" disabled={testResolve.isPending} onClick={() => testResolve.mutate(line.id)}><Zap /></Button><Button variant="ghost" size="icon" aria-label="复制线路" disabled={duplicate.isPending} onClick={() => duplicate.mutate(line.id)}><Copy /></Button><Button variant="ghost" size="icon" aria-label="编辑线路" onClick={() => openEdit(line)}><Pencil /></Button><Button variant="ghost" size="icon" aria-label="删除线路" onClick={() => setDeleting(line)}><Trash2 className="text-destructive" /></Button></div></TableCell>
            </TableRow>)}</TableBody>
          </Table> : <EmptyState title="暂无线路" description="创建直连线路或中继线路后，套餐即可按线路匹配。" className="border-0" />}
        </CardContent>
      </Card>
      <LineFormDialog open={formOpen} onOpenChange={setFormOpen} line={editing} nodes={nodes ?? []} certificates={certificates?.data ?? []} pending={busy} onSubmit={(payload) => editing ? update.mutate({ id: editing.id, ...payload }, { onSuccess: () => setFormOpen(false) }) : create.mutate(payload, { onSuccess: () => setFormOpen(false) })} />
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除线路「{deleting?.name}」？</AlertDialogTitle><AlertDialogDescription>删除后该线路不会再参与套餐匹配，已导入的订阅将在下次刷新时移除。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}>确认删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><GitBranch className="h-3.5 w-3.5" />直连线路直接连接目标入站；中继线路由入口节点承接用户连接后转发至目标出口。</div>
    </PageContainer>
  );
}
