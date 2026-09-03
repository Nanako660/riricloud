import * as React from 'react';
import { Archive, Eye, FileUp, PackageOpen, Power, Star, XCircle } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { EmptyState } from '@/components/shared/empty-state';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/shared/responsive-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useAdminBinaryResource, useAdminBinaryResources, useBinaryResourceMutations, type BinaryKind, type BinaryResource } from './use-binaries';

const targetOptions = [
  ['agent-linux-amd64', 'Agent · Linux amd64'],
  ['agent-linux-arm64', 'Agent · Linux arm64'],
  ['agent-macos-amd64', 'Agent · macOS amd64'],
  ['agent-macos-arm64', 'Agent · macOS arm64'],
  ['agent-windows-amd64', 'Agent · Windows amd64'],
  ['singbox-linux-amd64', 'Sing-box · Linux amd64'],
  ['singbox-linux-arm64', 'Sing-box · Linux arm64'],
  ['singbox-macos-amd64', 'Sing-box · macOS amd64'],
  ['singbox-macos-arm64', 'Sing-box · macOS arm64'],
  ['singbox-windows-amd64', 'Sing-box · Windows amd64']
] as const;

function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

function statusLabel(status: BinaryResource['status']) {
  return { DRAFT: '草稿', ACTIVE: '启用', DISABLED: '停用', RETIRED: '归档' }[status];
}

function sourceLabel(source: string) {
  return { BUILTIN: '内置', UPLOAD: '上传', REMOTE: '远程导入' }[source] ?? source;
}

function ResourceForm({ mode, open, onOpenChange, onSubmit, pending }: {
  mode: 'upload' | 'import';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: { file?: File; kind: BinaryKind; upstreamVersion: string; revision?: number; target: string; filename?: string; url?: string; sha256: string }) => void;
  pending: boolean;
}) {
  const [kind, setKind] = React.useState<BinaryKind>('SINGBOX');
  const [version, setVersion] = React.useState('');
  const [revision, setRevision] = React.useState('1');
  const [target, setTarget] = React.useState('singbox-linux-amd64');
  const [filename, setFilename] = React.useState('');
  const [url, setUrl] = React.useState('');
  const [sha256, setSha256] = React.useState('');
  const [file, setFile] = React.useState<File>();

  React.useEffect(() => {
    if (open) {
      setKind('SINGBOX'); setVersion(''); setRevision('1'); setTarget('singbox-linux-amd64'); setFilename(''); setUrl(''); setSha256(''); setFile(undefined);
    }
  }, [open]);

  const valid = version.trim() && /^\d+$/.test(revision) && target && /^[a-f0-9]{64}$/i.test(sha256) && (mode === 'upload' ? file : /^https?:\/\//i.test(url));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    onSubmit({ kind, upstreamVersion: version.trim(), revision: Number(revision), target, filename: filename.trim() || undefined, url: mode === 'import' ? url.trim() : undefined, file, sha256: sha256.trim().toLowerCase() });
  };
  const filteredTargets = targetOptions.filter(([value]) => value.startsWith(`${kind.toLowerCase()}-`));
  React.useEffect(() => { if (!target.startsWith(`${kind.toLowerCase()}-`)) setTarget(filteredTargets[0]?.[0] ?? target); }, [kind, target, filteredTargets]);

  return <ResponsiveDialog open={open} onOpenChange={onOpenChange}><ResponsiveDialogContent size="compact"><DialogHeader><DialogTitle>{mode === 'upload' ? '上传资源' : '远程导入资源'}</DialogTitle><DialogDescription>资源先以草稿保存，校验文件后再启用。</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={submit}>
    <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>资源类型</Label><Select value={kind} onValueChange={(value) => setKind(value as BinaryKind)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="AGENT">RiriCloud Agent</SelectItem><SelectItem value="SINGBOX">Sing-box 内核</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label htmlFor="binary-version">上游版本</Label><Input id="binary-version" value={version} onChange={(event) => setVersion(event.target.value)} placeholder={kind === 'SINGBOX' ? '1.14.0' : '0.5.0'} /></div></div>
    <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>平台</Label><Select value={target} onValueChange={setTarget}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{filteredTargets.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="binary-revision">资源修订号</Label><Input id="binary-revision" inputMode="numeric" value={revision} onChange={(event) => setRevision(event.target.value)} /></div></div>
    {mode === 'upload' ? <div className="space-y-2"><Label htmlFor="binary-file">文件</Label><Input id="binary-file" type="file" onChange={(event) => setFile(event.target.files?.[0])} /></div> : <div className="space-y-2"><Label htmlFor="binary-url">下载 URL</Label><Input id="binary-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://downloads.example.com/sing-box" /></div>}
    <div className="space-y-2"><Label htmlFor="binary-sha">SHA-256</Label><Input id="binary-sha" className="font-mono text-xs" value={sha256} onChange={(event) => setSha256(event.target.value)} placeholder="64 位十六进制摘要" /></div>
    <div className="space-y-2"><Label htmlFor="binary-filename">文件名（可选）</Label><Input id="binary-filename" value={filename} onChange={(event) => setFilename(event.target.value)} placeholder={kind === 'AGENT' ? 'riri-agent' : 'sing-box'} /></div>
    <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button><Button type="submit" disabled={!valid || pending}>{pending ? '处理中…' : mode === 'upload' ? '上传资源' : '导入资源'}</Button></DialogFooter>
  </form></ResponsiveDialogContent></ResponsiveDialog>;
}

function ResourceDetail({ id, open, onOpenChange }: { id: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data, isPending } = useAdminBinaryResource(id);
  return <ResponsiveDialog open={open} onOpenChange={onOpenChange}><ResponsiveDialogContent size="wide"><DialogHeader><DialogTitle>资源详情</DialogTitle><DialogDescription>{data ? `${data.kind === 'SINGBOX' ? 'Sing-box' : 'Agent'} · ${data.version}` : '加载资源信息'}</DialogDescription></DialogHeader>{isPending ? <div className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-32 w-full" /></div> : data ? <div className="min-w-0 space-y-5"><div className="grid gap-3 text-sm sm:grid-cols-4"><div><p className="text-muted-foreground">来源</p><p className="font-medium">{sourceLabel(data.source)}</p></div><div><p className="text-muted-foreground">状态</p><Badge variant={data.status === 'ACTIVE' ? 'default' : data.status === 'RETIRED' ? 'destructive' : 'secondary'}>{statusLabel(data.status)}</Badge></div><div><p className="text-muted-foreground">默认</p><p className="font-medium">{data.isDefault ? '是' : '否'}</p></div><div><p className="text-muted-foreground">分发任务</p><p className="font-medium">{data.deploymentCount ?? data.deploymentTasks?.length ?? 0}</p></div></div><Separator /><div className="min-w-0 space-y-3"><h3 className="text-sm font-semibold">平台资产</h3>{data.assets.map((asset) => <div key={asset.id} className="min-w-0 overflow-hidden rounded-md border p-3"><div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1"><span className="min-w-0 break-words font-medium">{asset.target}</span><span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{bytes(asset.size)}</span></div><p className="mt-1 break-all font-mono text-[11px] leading-4 text-muted-foreground" title={asset.sha256}>{asset.sha256}</p><div className="mt-2 min-w-0 space-y-1 text-xs text-muted-foreground">{asset.files.map((file) => <div key={file.id} className="flex min-w-0 flex-wrap justify-between gap-x-2 gap-y-1"><span className="min-w-0 break-words">{file.role === 'auxiliary' ? '辅助' : '主文件'} · {file.name}</span><span className="break-all font-mono text-right">{file.sha256}</span></div>)}</div></div>)}</div>{data.deploymentTasks?.length ? <div className="min-w-0 space-y-3"><h3 className="text-sm font-semibold">最近分发</h3>{data.deploymentTasks.slice(0, 10).map((task) => <div key={task.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs"><span className="min-w-0 flex-1 break-words">{task.node?.name ?? task.nodeId} · {task.operation}</span><Badge variant={task.status === 'COMPLETED' ? 'default' : task.status === 'FAILED' ? 'destructive' : 'secondary'}>{task.status}</Badge><span className="shrink-0 text-muted-foreground">尝试 {task.attempts} 次</span></div>)}</div> : null}</div> : <EmptyState title="资源不存在" description="资源可能已经被移除。" />}</ResponsiveDialogContent></ResponsiveDialog>;
}

export default function BinariesPage() {
  const { data, isPending, isError } = useAdminBinaryResources();
  const mutations = useBinaryResourceMutations();
  const [kind, setKind] = React.useState<'ALL' | BinaryKind>('ALL');
  const [platform, setPlatform] = React.useState('ALL');
  const [status, setStatus] = React.useState<'ALL' | BinaryResource['status']>('ALL');
  const [formMode, setFormMode] = React.useState<'upload' | 'import' | null>(null);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const visible = (data ?? []).filter((item) => (kind === 'ALL' || item.kind === kind) && (status === 'ALL' || item.status === status) && (platform === 'ALL' || item.assets.some((asset) => asset.target.endsWith(`-${platform}`))));
  const submit = (value: { file?: File; kind: BinaryKind; upstreamVersion: string; revision?: number; target: string; filename?: string; url?: string; sha256: string }) => {
    if (formMode === 'upload' && value.file) mutations.uploadResource.mutate({ ...value, file: value.file });
    if (formMode === 'import' && value.url) mutations.importResource.mutate({ ...value, url: value.url });
    setFormMode(null);
  };
  if (isPending) return <PageContainer><PageHeader title="资源管理" /><Skeleton className="h-12 w-full" /><Skeleton className="h-72 w-full" /></PageContainer>;
  if (isError) return <PageContainer><PageHeader title="资源管理" /><EmptyState title="无法加载资源" description="请稍后刷新重试。" /></PageContainer>;
  return <PageContainer><PageHeader title="资源管理" description="独立管理 Agent 与 Sing-box 的可分发版本。" /><div className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"><div className="grid min-w-0 w-full gap-2 sm:grid-cols-3"><Select value={kind} onValueChange={(value) => setKind(value as typeof kind)}><SelectTrigger><SelectValue placeholder="资源类型" /></SelectTrigger><SelectContent><SelectItem value="ALL">全部类型</SelectItem><SelectItem value="AGENT">Agent</SelectItem><SelectItem value="SINGBOX">Sing-box</SelectItem></SelectContent></Select><Select value={platform} onValueChange={setPlatform}><SelectTrigger><SelectValue placeholder="平台" /></SelectTrigger><SelectContent><SelectItem value="ALL">全部平台</SelectItem><SelectItem value="linux-amd64">Linux amd64</SelectItem><SelectItem value="linux-arm64">Linux arm64</SelectItem><SelectItem value="macos-amd64">macOS amd64</SelectItem><SelectItem value="macos-arm64">macOS arm64</SelectItem><SelectItem value="windows-amd64">Windows amd64</SelectItem></SelectContent></Select><Select value={status} onValueChange={(value) => setStatus(value as typeof status)}><SelectTrigger><SelectValue placeholder="状态" /></SelectTrigger><SelectContent><SelectItem value="ALL">全部状态</SelectItem><SelectItem value="DRAFT">草稿</SelectItem><SelectItem value="ACTIVE">启用</SelectItem><SelectItem value="DISABLED">停用</SelectItem><SelectItem value="RETIRED">归档</SelectItem></SelectContent></Select></div><div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto"><Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setFormMode('import')}><PackageOpen />远程导入</Button><Button className="flex-1 sm:flex-none" onClick={() => setFormMode('upload')}><FileUp />上传文件</Button></div></div><div className="grid min-w-0 gap-4 xl:grid-cols-2">{visible.map((item) => <Card key={item.id} className="min-w-0 overflow-hidden"><CardHeader className="min-w-0 flex-col items-start justify-between gap-3 space-y-0 sm:flex-row"><div className="min-w-0"><div className="flex min-w-0 flex-wrap items-center gap-2"><CardTitle className="text-base">{item.kind === 'SINGBOX' ? 'Sing-box' : 'RiriCloud Agent'} · {item.version}</CardTitle>{item.isDefault && <Badge variant="outline"><Star className="mr-1 size-3" />默认</Badge>}</div><p className="mt-1 break-words text-sm text-muted-foreground">{sourceLabel(item.source)} · {item.assets.length} 个平台资产</p></div><Badge className="shrink-0" variant={item.status === 'ACTIVE' ? 'default' : item.status === 'RETIRED' ? 'destructive' : 'secondary'}>{statusLabel(item.status)}</Badge></CardHeader><CardContent className="min-w-0 space-y-4"><div className="grid min-w-0 gap-2 sm:grid-cols-2">{item.assets.map((asset) => <div key={asset.id} className="min-w-0 overflow-hidden rounded-md border p-3 text-xs"><div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1"><span className="min-w-0 break-words font-medium">{asset.target}</span><span className="shrink-0 whitespace-nowrap text-muted-foreground">{bytes(asset.size)}</span></div><p className="mt-1 break-all font-mono text-[11px] leading-4 text-muted-foreground" title={asset.sha256}>{asset.sha256}</p><p className="mt-1 text-muted-foreground">{asset.files.length || 1} 个文件</p></div>)}</div><div className="flex min-w-0 flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between"><span className="min-w-0 break-words text-xs text-muted-foreground">引用分发：{item.deploymentCount ?? item.deploymentTasks?.length ?? 0} 次</span><div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" size="icon" aria-label="查看资源详情" title="查看资源详情" onClick={() => setDetailId(item.id)}><Eye /></Button>{item.status === 'DRAFT' || item.status === 'DISABLED' ? <Button variant="outline" size="sm" onClick={() => mutations.activate.mutate(item.id)} disabled={mutations.activate.isPending}><Power />启用</Button> : null}{item.status === 'ACTIVE' ? <Button variant="outline" size="sm" onClick={() => mutations.disable.mutate(item.id)} disabled={mutations.disable.isPending}><XCircle />停用</Button> : null}{item.status === 'ACTIVE' && !item.isDefault ? <Button variant="outline" size="sm" onClick={() => mutations.setDefault.mutate(item.id)} disabled={mutations.setDefault.isPending}><Star />设为默认</Button> : null}{item.status !== 'RETIRED' ? <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" aria-label="归档资源" title="归档资源"><Archive /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>归档 {item.version}？</AlertDialogTitle><AlertDialogDescription>归档后不会再被选择用于新的升级任务，历史分发记录会保留。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => mutations.retire.mutate(item.id)}>确认归档</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog> : null}</div></div></CardContent></Card>)}</div>{!visible.length && <EmptyState title="没有匹配资源" description="上传或导入一个资源开始管理。" />}<ResourceForm mode={formMode ?? 'upload'} open={formMode !== null} onOpenChange={(open) => !open && setFormMode(null)} onSubmit={submit} pending={mutations.uploadResource.isPending || mutations.importResource.isPending} /><ResourceDetail id={detailId} open={detailId !== null} onOpenChange={(open) => !open && setDetailId(null)} /></PageContainer>;
}
