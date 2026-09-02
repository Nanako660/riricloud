import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { ArrowLeft, Cpu, GitBranch, KeyRound, Network, RefreshCw, RotateCcw, Server, Trash2, Wrench } from 'lucide-react';
import { PageContainer } from '@/components/shared/page-container';
import { CopyButton } from '@/components/shared/copy-button';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/shared/responsive-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatRate } from '@/lib/utils';
import { useAdminBinaryInfo, useAdminNodeDetail, useNodeMutations, type AdminNode, type NodeLine, type ProbeSnapshot } from './use-nodes';
import { UpgradeNodeDialog } from './components/upgrade-node-dialog';
import { ProbeNodeDialog } from './components/probe-node-dialog';

function nodeRate(status: string, value: number | null) {
  return status === 'ONLINE' && value != null ? formatRate(value) : '—';
}

function nodeTotalRate(node: AdminNode) {
  if (node.status !== 'ONLINE') return '—';
  if (node.uploadRate != null && node.downloadRate != null) return formatRate(node.uploadRate + node.downloadRate);
  return node.bandwidthRate != null ? formatRate(node.bandwidthRate) : '—';
}

function GeneratedConfigPreview({ node }: { node: { id: string; lines: NodeLine[] } }) {
  const inbounds = node.lines.flatMap((line) => {
    const result: Array<Record<string, unknown>> = [];
    if (line.entryNodeId === node.id) result.push({ type: line.type === 'RELAY' && line.relayMode === 'BLIND_FORWARD' ? 'direct' : line.protocolType.toLowerCase(), tag: line.type === 'RELAY' ? `relay-${line.id}` : `line-${line.id}`, listen: '0.0.0.0', listen_port: line.entryPort });
    if (line.exitNodeId === node.id && line.type === 'RELAY') result.push({ type: line.protocolType.toLowerCase(), tag: `line-${line.id}-exit`, listen: '0.0.0.0', listen_port: line.exitPort });
    return result;
  });
  return <pre className="max-h-[480px] overflow-auto rounded-md border bg-muted/50 p-3 text-xs leading-relaxed">{JSON.stringify({ log: { level: 'info', timestamp: true }, inbounds, outbounds: [{ type: 'direct', tag: 'direct' }] }, null, 2)}</pre>;
}

function ProbeSnapshotCard({ snapshot }: { snapshot: ProbeSnapshot | null }) {
  if (!snapshot) return <p className="text-sm text-muted-foreground">尚未完成网络诊断。</p>;
  return <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{snapshot.success ? '诊断通过' : '诊断存在异常'}</p><span className="text-xs text-muted-foreground">{new Date(snapshot.completedAt).toLocaleString('zh-CN')}</span></div>{snapshot.results.map((result, index) => <div key={`${result.type}-${result.target}-${index}`} className="rounded-md border p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{result.type.toUpperCase()} · {result.target}</span><Badge variant={result.success ? 'default' : 'destructive'}>{result.success ? '正常' : '失败'}</Badge></div><p className="mt-1 text-xs text-muted-foreground">延迟：{result.latencyMs != null ? `${result.latencyMs} ms` : '—'} · 丢包：{result.packetLossPercent ?? (result.success ? 0 : 100)}%{result.addresses?.length ? ` · 地址：${result.addresses.join(', ')}` : ''}</p>{result.message && <p className="mt-1 break-words text-xs text-destructive">{result.message}</p>}</div>)}</div>;
}

function InstallCommandDialog({ open, onOpenChange, node }: { open: boolean; onOpenChange: (open: boolean) => void; node: AdminNode }) {
  const commands = node.installCommands ?? { ws: `curl -fsSL --location -A 'riri-agent-installer/linux-amd64' 'https://<master-domain>/api/v1/downloads/agent?token=${node.agentToken}' -o /tmp/riri-agent && install -m 0755 /tmp/riri-agent /usr/local/bin/riri-agent && rm -f /tmp/riri-agent && /usr/local/bin/riri-agent install --token=${node.agentToken} --master=wss://<master-domain>/ws/agent`, http: `curl -fsSL --location -A 'riri-agent-installer/linux-amd64' 'https://<master-domain>/api/v1/downloads/agent?token=${node.agentToken}' -o /tmp/riri-agent && install -m 0755 /tmp/riri-agent /usr/local/bin/riri-agent && rm -f /tmp/riri-agent && /usr/local/bin/riri-agent install --token=${node.agentToken} --master=https://<master-domain>` };
  const uninstallCommand = node.uninstallCommand ?? 'sudo /usr/local/bin/riri-agent uninstall --purge --yes';
  return <ResponsiveDialog open={open} onOpenChange={onOpenChange}><ResponsiveDialogContent size="compact"><DialogHeader><DialogTitle>Agent 原生 CLI</DialogTitle><DialogDescription>在目标 VPS 上以 root 身份执行安装命令；安装后使用 Agent 自带的生命周期命令运维。</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label>WS / WSS 长连接</Label><div className="flex items-start gap-2"><code className="min-w-0 flex-1 break-all rounded-md border bg-muted/40 p-3 text-xs">{commands.ws}</code><CopyButton value={commands.ws} /></div></div><div className="space-y-2"><Label>HTTP / HTTPS 轮询</Label><div className="flex items-start gap-2"><code className="min-w-0 flex-1 break-all rounded-md border bg-muted/40 p-3 text-xs">{commands.http}</code><CopyButton value={commands.http} /></div></div><div className="space-y-2"><Label>彻底卸载</Label><div className="flex items-start gap-2"><code className="min-w-0 flex-1 break-all rounded-md border bg-muted/40 p-3 text-xs">{uninstallCommand}</code><CopyButton value={uninstallCommand} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>关闭</Button></DialogFooter></ResponsiveDialogContent></ResponsiveDialog>;
}

export default function NodeDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  const { data: node, isPending, isError } = useAdminNodeDetail(id);
  const { data: binaryInfo } = useAdminBinaryInfo();
  const { updateNode, deleteNode, reloadNode, upgradeNode, probeNode, restartAgent, importBinary, waitForTask } = useNodeMutations();
  const [name, setName] = React.useState('');
  const [serverHost, setServerHost] = React.useState('');
  const [override, setOverride] = React.useState('');
  const [upgradeOpen, setUpgradeOpen] = React.useState(false);
  const [probeOpen, setProbeOpen] = React.useState(false);
  const [installOpen, setInstallOpen] = React.useState(false);

  React.useEffect(() => {
    if (node) { setName(node.name); setServerHost(node.serverHost); setOverride(node.configOverride ?? ''); }
  }, [node]);

  if (isPending) return <PageContainer><Skeleton className="h-8 w-48" /><Skeleton className="h-12 w-full" /><Skeleton className="h-72 w-full" /></PageContainer>;
  if (isError || !node) return <PageContainer><EmptyState title="节点不存在" description="该节点可能已被删除" /><Button variant="outline" size="sm" asChild><Link to="/admin/nodes">返回节点列表</Link></Button></PageContainer>;

  const statusLabel = node.status === 'ONLINE' ? (node.communicationMode === 'HTTP' ? 'HTTP 轮询' : 'WS 在线') : node.status === 'DISABLED' ? '已禁用' : '离线';
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
  const wait = (taskId: string, label: string) => { void waitForTask({ nodeId: node.id, taskId, label }); };

  return <PageContainer>
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="flex min-w-0 items-center gap-3"><Button variant="ghost" size="icon" asChild aria-label="返回"><Link to="/admin/nodes"><ArrowLeft className="h-4 w-4" /></Link></Button><div className="min-w-0"><h1 className="truncate text-2xl font-semibold tracking-tight">{node.name}</h1><p className="truncate text-sm text-muted-foreground">{node.serverHost}</p></div><Badge variant={node.status === 'ONLINE' ? 'default' : 'secondary'}>{statusLabel}</Badge></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={reloadNode.isPending} onClick={() => reloadNode.mutate(node.id)}><RefreshCw />重载内核</Button><Button variant="outline" size="sm" disabled={restartAgent.isPending} onClick={() => restartAgent.mutate(node.id, { onSuccess: (data) => data.requested && wait(data.taskId, 'Agent 重启') })}><RotateCcw />重启 Agent</Button><Button variant="outline" size="sm" onClick={() => setProbeOpen(true)}><Network />网络探针</Button><Button variant="outline" size="sm" onClick={() => setUpgradeOpen(true)}><Wrench />升级中心</Button><Button variant="outline" size="sm" onClick={() => setInstallOpen(true)}><Server />安装命令</Button></div></div>
    {node.configError && <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"><span className="font-medium">内核最近错误：</span>{node.configError}</div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">线路承载</p><p className="mt-1 text-2xl font-semibold">{node.lines.length}</p></CardContent></Card><Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">派生端口</p><p className="mt-1 text-2xl font-semibold">{node.servicePorts.length}</p></CardContent></Card><Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">CPU</p><p className="mt-1 text-2xl font-semibold">{node.cpuUsage != null ? `${node.cpuUsage.toFixed(1)}%` : '—'}</p></CardContent></Card><Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">内存</p><p className="mt-1 text-2xl font-semibold">{node.memoryUsage != null ? `${node.memoryUsage.toFixed(1)}%` : '—'}</p></CardContent></Card></div>
    <Tabs defaultValue="lines"><TabsList className="w-full justify-start overflow-x-auto"><TabsTrigger value="lines">线路承载</TabsTrigger><TabsTrigger value="basic">基础与遥测</TabsTrigger><TabsTrigger value="advanced">高级与运维</TabsTrigger></TabsList>
      <TabsContent value="lines" className="space-y-4"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><GitBranch className="h-4 w-4" />当前承载线路（{node.lines.length}）</CardTitle></CardHeader><CardContent className="p-0">{node.lines.length ? <Table className="min-w-[720px]"><TableHeader><TableRow><TableHead>线路</TableHead><TableHead>协议</TableHead><TableHead>角色</TableHead><TableHead>入口</TableHead><TableHead>出口</TableHead><TableHead>状态</TableHead></TableRow></TableHeader><TableBody>{node.lines.map((line) => <TableRow key={line.id}><TableCell className="font-medium">{line.name}</TableCell><TableCell><Badge variant="outline">{line.protocolType}</Badge></TableCell><TableCell>{line.role === 'ENTRY_AND_EXIT' ? '入口 / 出口' : line.role === 'ENTRY' ? '入口' : '出口'}{line.type === 'RELAY' && <span className="ml-1 text-xs text-muted-foreground">· {line.relayMode === 'BLIND_FORWARD' ? '盲转发' : '协议代理'}</span>}</TableCell><TableCell className="tabular-nums">{line.entryNodeId === node.id ? line.entryPort : '—'}</TableCell><TableCell className="tabular-nums">{line.exitNodeId === node.id ? line.exitPort : '—'}</TableCell><TableCell><Badge variant={line.status === 'ACTIVE' ? 'default' : 'secondary'}>{line.status === 'ACTIVE' ? '启用' : '禁用'}</Badge></TableCell></TableRow>)}</TableBody></Table> : <EmptyState title="暂无承载线路" description="请在线路管理中创建并选择该节点。" className="border-0" />}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">派生监听端口</CardTitle></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2">{node.servicePorts.length ? node.servicePorts.map((port) => <div key={`${port.lineId}-${port.role}`} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"><span className="truncate">{port.lineName}</span><span className="font-mono text-xs text-muted-foreground">{port.port} · {port.role === 'ENTRY' ? '入口' : '出口'}</span></div>) : <p className="text-sm text-muted-foreground">暂无派生端口</p>}</CardContent></Card></TabsContent>
      <TabsContent value="basic" className="space-y-4"><Card><CardHeader><CardTitle className="text-base">基础信息</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="node-name">节点名称</Label><Input id="node-name" value={name} onChange={(event) => setName(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="node-host">服务器地址</Label><Input id="node-host" value={serverHost} onChange={(event) => setServerHost(event.target.value)} /></div></div><Button size="sm" disabled={updateNode.isPending} onClick={saveBasic}>保存基础信息</Button></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4" />Agent 接入与画像</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex items-center gap-2"><code className="min-w-0 flex-1 truncate rounded-md border bg-muted/50 px-3 py-2 text-xs">{node.agentToken}</code><CopyButton value={node.agentToken} /></div><div className="grid gap-2 text-sm sm:grid-cols-2"><span className="text-muted-foreground">通信模式：<strong className="font-medium text-foreground">{node.communicationMode === 'HTTP' ? 'HTTP / HTTPS 轮询' : 'WS / WSS 长连接'}</strong></span><span className="text-muted-foreground">轮询建议：<strong className="font-medium text-foreground">{node.pollIntervalSecs} 秒</strong></span><span className="text-muted-foreground">Agent 版本：<strong className="font-medium text-foreground">{node.agentVersion || '未上报'}</strong></span><span className="text-muted-foreground">系统架构：<strong className="font-medium text-foreground">{node.osArch || '未上报'}</strong></span><span className="text-muted-foreground">Sing-box：<strong className="font-medium text-foreground">{node.kernelVersion || '未上报'}</strong></span><span className="text-muted-foreground">最近上报：<strong className="font-medium text-foreground">{node.lastSeenAt ? new Date(node.lastSeenAt).toLocaleString('zh-CN') : '未上报'}</strong></span></div><p className="text-sm text-muted-foreground">内核状态：{node.kernelRunning == null ? '未知' : node.kernelRunning ? '运行中' : '未运行'}</p></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Cpu className="h-4 w-4" />实时遥测</CardTitle></CardHeader><CardContent className="grid gap-4 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-5"><span>CPU：{node.cpuUsage != null ? `${node.cpuUsage.toFixed(1)}%` : '—'}</span><span>内存：{node.memoryUsage != null ? `${node.memoryUsage.toFixed(1)}%` : '—'}</span><span>上行：{nodeRate(node.status, node.uploadRate)}</span><span>下行：{nodeRate(node.status, node.downloadRate)}</span><span>合计：{nodeTotalRate(node)}</span><p className="sm:col-span-2 lg:col-span-5">节点网络吞吐，不参与计费；掉线节点不显示旧速率。</p></CardContent></Card></TabsContent>
      <TabsContent value="advanced" className="space-y-4"><Card><CardHeader><CardTitle className="text-base">最近网络质量诊断快照</CardTitle></CardHeader><CardContent><ProbeSnapshotCard snapshot={node.lastProbeResult} /></CardContent></Card><Card><CardHeader><CardTitle className="text-base">生成配置预览</CardTitle></CardHeader><CardContent><GeneratedConfigPreview node={node} /></CardContent></Card><Card><CardHeader><CardTitle className="text-base">覆盖配置（JSON）</CardTitle></CardHeader><CardContent className="min-w-0 space-y-3"><CodeMirror value={override} height="360px" theme={resolvedTheme === 'dark' ? 'dark' : 'light'} extensions={[json()]} onChange={setOverride} className="min-w-0 overflow-hidden rounded-md border" /><div className="flex flex-wrap gap-2"><Button size="sm" disabled={updateNode.isPending} onClick={saveOverride}>保存覆盖配置</Button><Button size="sm" variant="outline" disabled={!override} onClick={() => setOverride('')}>清空</Button></div><Separator /><p className="text-xs text-muted-foreground">顶层对象深合并，数组整体替换；提供 inbounds、outbounds 或 route 可接管对应配置片段。</p></CardContent></Card>{node.configError && <Card><CardHeader><CardTitle className="text-base text-destructive">内核最近一次错误日志抽样</CardTitle></CardHeader><CardContent className="space-y-3"><pre className="max-h-64 overflow-auto rounded-md border border-destructive/30 bg-destructive/5 p-3 font-mono text-xs leading-relaxed text-destructive">{node.configError}</pre><CopyButton value={node.configError} /></CardContent></Card>}{node.isLocal ? <Card className="border-muted bg-muted/20"><CardHeader><CardTitle className="text-base">系统节点</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">主控本机节点是系统保留节点，不支持删除；线路仍通过统一线路管理维护。</p></CardContent></Card> : <Card className="border-destructive/40 bg-destructive/5"><CardHeader><CardTitle className="flex items-center gap-2 text-base text-destructive"><Trash2 className="h-4 w-4" />危险操作区</CardTitle></CardHeader><CardContent className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center"><p className="text-xs text-muted-foreground">删除后该节点的线路承载关系与流量记录将永久清空。</p><AlertDialog><AlertDialogTrigger asChild><Button variant="destructive" size="sm" className="w-full sm:w-auto">删除节点</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>确认删除节点？</AlertDialogTitle><AlertDialogDescription>在线 Agent 会立即断开，相关线路将不再可用。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={remove}>确认删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></CardContent></Card>}</TabsContent>
    </Tabs>
    <InstallCommandDialog open={installOpen} onOpenChange={setInstallOpen} node={node} />
    <UpgradeNodeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} pending={upgradeNode.isPending} importing={importBinary.isPending} node={node} binaryInfo={binaryInfo} onSubmit={(values) => upgradeNode.mutate({ id: node.id, ...values }, { onSuccess: (data: { taskId: string; requested: boolean }) => data.requested && wait(data.taskId, '升级任务') })} onImport={(values) => importBinary.mutate(values)} />
    <ProbeNodeDialog open={probeOpen} onOpenChange={setProbeOpen} pending={probeNode.isPending} snapshot={node.lastProbeResult} onSubmit={(values) => probeNode.mutate({ id: node.id, ...values }, { onSuccess: (data: { taskId: string; requested: boolean }) => data.requested && wait(data.taskId, '探针任务') })} />
  </PageContainer>;
}
