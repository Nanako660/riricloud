import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { ArrowLeft, Cpu, GitBranch, KeyRound, RefreshCw, Trash2 } from 'lucide-react';
import { PageContainer } from '@/components/shared/page-container';
import { CopyButton } from '@/components/shared/copy-button';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAdminNodeDetail, useNodeMutations, type NodeLine } from './use-nodes';
import { UpgradeNodeDialog } from './components/upgrade-node-dialog';

function GeneratedConfigPreview({ node }: { node: { id: string; lines: NodeLine[] } }) {
  const inbounds = node.lines.flatMap((line) => {
    const result: Array<Record<string, unknown>> = [];
    if (line.entryNodeId === node.id) result.push({ type: line.type === 'RELAY' && line.relayMode === 'BLIND_FORWARD' ? 'direct' : line.protocolType.toLowerCase(), tag: line.type === 'RELAY' ? `relay-${line.id}` : `line-${line.id}`, listen: '0.0.0.0', listen_port: line.entryPort });
    if (line.exitNodeId === node.id && line.type === 'RELAY') result.push({ type: line.protocolType.toLowerCase(), tag: `line-${line.id}-exit`, listen: '0.0.0.0', listen_port: line.exitPort });
    return result;
  });
  return <pre className="max-h-[480px] overflow-auto rounded-md border bg-muted/50 p-3 text-xs leading-relaxed">{JSON.stringify({ log: { level: 'info', timestamp: true }, inbounds, outbounds: [{ type: 'direct', tag: 'direct' }] }, null, 2)}</pre>;
}

export default function NodeDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  const { data: node, isPending, isError } = useAdminNodeDetail(id);
  const { updateNode, deleteNode, reloadNode, upgradeNode } = useNodeMutations();
  const [name, setName] = React.useState('');
  const [serverHost, setServerHost] = React.useState('');
  const [override, setOverride] = React.useState('');
  const [upgradeOpen, setUpgradeOpen] = React.useState(false);

  React.useEffect(() => {
    if (node) { setName(node.name); setServerHost(node.serverHost); setOverride(node.configOverride ?? ''); }
  }, [node]);

  if (isPending) return <PageContainer><Skeleton className="h-8 w-48" /><Skeleton className="h-12 w-full" /><Skeleton className="h-72 w-full" /></PageContainer>;
  if (isError || !node) return <PageContainer><EmptyState title="节点不存在" description="该节点可能已被删除" /><Button variant="outline" size="sm" asChild><Link to="/admin/nodes">返回节点列表</Link></Button></PageContainer>;

  const statusLabel = node.status === 'ONLINE' ? '在线' : node.status === 'DISABLED' ? '已禁用' : '离线';
  const saveBasic = () => updateNode.mutate({ id: node.id, name, serverHost });
  const saveOverride = () => {
    const value = override.trim();
    if (value) {
      try { const parsed: unknown = JSON.parse(value); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); }
      catch { toast.error('覆盖配置须为合法 JSON 对象'); return; }
    }
    updateNode.mutate({ id: node.id, configOverride: value || null });
  };
  const remove = () => deleteNode.mutate(node.id, { onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['admin', 'nodes'] }); navigate('/admin/nodes'); } });

  return <PageContainer>
    <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><Button variant="ghost" size="icon" asChild aria-label="返回"><Link to="/admin/nodes"><ArrowLeft className="h-4 w-4" /></Link></Button><div className="min-w-0"><h1 className="truncate text-2xl font-semibold tracking-tight">{node.name}</h1><p className="truncate text-sm text-muted-foreground">{node.serverHost}</p></div><Badge variant={node.status === 'ONLINE' ? 'default' : 'secondary'}>{statusLabel}</Badge></div><div className="flex gap-2"><Button variant="outline" size="sm" disabled={reloadNode.isPending} onClick={() => reloadNode.mutate(node.id)}><RefreshCw />重载</Button><Button variant="outline" size="sm" onClick={() => setUpgradeOpen(true)}>升级</Button></div></div>
    {node.configError && <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"><span className="font-medium">配置应用失败：</span>{node.configError}</div>}
    <div className="grid gap-3 sm:grid-cols-4"><Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">线路承载</p><p className="mt-1 text-2xl font-semibold">{node.lines.length}</p></CardContent></Card><Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">派生端口</p><p className="mt-1 text-2xl font-semibold">{node.servicePorts.length}</p></CardContent></Card><Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">CPU</p><p className="mt-1 text-2xl font-semibold">{node.cpuUsage != null ? `${node.cpuUsage.toFixed(1)}%` : '—'}</p></CardContent></Card><Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">内存</p><p className="mt-1 text-2xl font-semibold">{node.memoryUsage != null ? `${node.memoryUsage.toFixed(1)}%` : '—'}</p></CardContent></Card></div>
    <Tabs defaultValue="lines"><TabsList><TabsTrigger value="lines">线路承载</TabsTrigger><TabsTrigger value="basic">基础与遥测</TabsTrigger><TabsTrigger value="advanced">高级与运维</TabsTrigger></TabsList>
      <TabsContent value="lines" className="space-y-4"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><GitBranch className="h-4 w-4" />当前承载线路（{node.lines.length}）</CardTitle></CardHeader><CardContent className="p-0">{node.lines.length ? <Table><TableHeader><TableRow><TableHead>线路</TableHead><TableHead>协议</TableHead><TableHead>角色</TableHead><TableHead>入口</TableHead><TableHead>出口</TableHead><TableHead>状态</TableHead></TableRow></TableHeader><TableBody>{node.lines.map((line) => <TableRow key={line.id}><TableCell className="font-medium">{line.name}</TableCell><TableCell><Badge variant="outline">{line.protocolType}</Badge></TableCell><TableCell>{line.role === 'ENTRY_AND_EXIT' ? '入口 / 出口' : line.role === 'ENTRY' ? '入口' : '出口'}{line.type === 'RELAY' && <span className="ml-1 text-xs text-muted-foreground">· {line.relayMode === 'BLIND_FORWARD' ? '盲转发' : '协议代理'}</span>}</TableCell><TableCell className="tabular-nums">{line.entryNodeId === node.id ? line.entryPort : '—'}</TableCell><TableCell className="tabular-nums">{line.exitNodeId === node.id ? line.exitPort : '—'}</TableCell><TableCell><Badge variant={line.status === 'ACTIVE' ? 'default' : 'secondary'}>{line.status === 'ACTIVE' ? '启用' : '禁用'}</Badge></TableCell></TableRow>)}</TableBody></Table> : <EmptyState title="暂无承载线路" description="请在线路管理中创建并选择该节点。" className="border-0" />}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">派生监听端口</CardTitle></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2">{node.servicePorts.length ? node.servicePorts.map((port) => <div key={`${port.lineId}-${port.role}`} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"><span className="truncate">{port.lineName}</span><span className="font-mono text-xs text-muted-foreground">{port.port} · {port.role === 'ENTRY' ? '入口' : '出口'}</span></div>) : <p className="text-sm text-muted-foreground">暂无派生端口</p>}</CardContent></Card></TabsContent>
      <TabsContent value="basic" className="space-y-4"><Card><CardHeader><CardTitle className="text-base">基础信息</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="node-name">节点名称</Label><Input id="node-name" value={name} onChange={(event) => setName(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="node-host">服务器地址</Label><Input id="node-host" value={serverHost} onChange={(event) => setServerHost(event.target.value)} /></div></div><Button size="sm" disabled={updateNode.isPending} onClick={saveBasic}>保存基础信息</Button></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4" />Agent 接入</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex items-center gap-2"><code className="min-w-0 flex-1 truncate rounded-md border bg-muted/50 px-3 py-2 text-xs">{node.agentToken}</code><CopyButton value={node.agentToken} /></div><p className="text-sm text-muted-foreground">内核状态：{node.kernelRunning == null ? '未知' : node.kernelRunning ? '运行中' : '未运行'}</p></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Cpu className="h-4 w-4" />实时遥测</CardTitle></CardHeader><CardContent className="grid grid-cols-3 gap-4 text-sm text-muted-foreground"><span>CPU：{node.cpuUsage != null ? `${node.cpuUsage.toFixed(1)}%` : '—'}</span><span>内存：{node.memoryUsage != null ? `${node.memoryUsage.toFixed(1)}%` : '—'}</span><span>带宽：{node.bandwidthRate != null ? `${(node.bandwidthRate / 1024).toFixed(1)} KB/s` : '—'}</span></CardContent></Card></TabsContent>
      <TabsContent value="advanced" className="space-y-4"><Card><CardHeader><CardTitle className="text-base">生成配置预览</CardTitle></CardHeader><CardContent><GeneratedConfigPreview node={node} /></CardContent></Card><Card><CardHeader><CardTitle className="text-base">覆盖配置（JSON）</CardTitle></CardHeader><CardContent className="space-y-3"><CodeMirror value={override} height="360px" theme={resolvedTheme === 'dark' ? 'dark' : 'light'} extensions={[json()]} onChange={setOverride} className="overflow-hidden rounded-md border" /><div className="flex gap-2"><Button size="sm" disabled={updateNode.isPending} onClick={saveOverride}>保存覆盖配置</Button><Button size="sm" variant="outline" disabled={!override} onClick={() => setOverride('')}>清空</Button></div><Separator /><p className="text-xs text-muted-foreground">顶层对象深合并，数组整体替换；提供 inbounds、outbounds 或 route 可接管对应配置片段。</p></CardContent></Card>{node.isLocal ? <Card className="border-muted bg-muted/20"><CardHeader><CardTitle className="text-base">系统节点</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">主控本机节点是系统保留节点，不支持删除；线路仍通过统一线路管理维护。</p></CardContent></Card> : <Card className="border-destructive/40 bg-destructive/5"><CardHeader><CardTitle className="flex items-center gap-2 text-base text-destructive"><Trash2 className="h-4 w-4" />危险操作区</CardTitle></CardHeader><CardContent className="flex items-center justify-between gap-4"><p className="text-xs text-muted-foreground">删除后该节点的线路承载关系与流量记录将永久清空。</p><AlertDialog><AlertDialogTrigger asChild><Button variant="destructive" size="sm">删除节点</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>确认删除节点？</AlertDialogTitle><AlertDialogDescription>在线 Agent 会立即断开，相关线路将不再可用。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={remove}>确认删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></CardContent></Card>}</TabsContent>
    </Tabs><UpgradeNodeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} pending={upgradeNode.isPending} onSubmit={(values) => upgradeNode.mutate({ id: node.id, ...values }, { onSuccess: () => setUpgradeOpen(false) })} />
  </PageContainer>;
}
