import * as React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime, formatRate } from '@/lib/utils';
import { useAdminNodes, useNodeMutations, type AdminNode } from './use-nodes';
import { NodeFormDialog } from './components/node-form-dialog';

function NodeStatusBadge({ node }: { node: AdminNode }) {
  if (node.status === 'DISABLED') return <Badge variant="secondary">已禁用</Badge>;
  if (node.status !== 'ONLINE') return <Badge variant="secondary">离线</Badge>;
  return <Badge variant={node.communicationMode === 'HTTP' ? 'outline' : 'default'}>{node.communicationMode === 'HTTP' ? 'HTTP 轮询' : 'WS 在线'}</Badge>;
}

function formatLastSeen(value: string | null) {
  return value ? formatDateTime(value) : '未上报';
}

function NodeRate({ node }: { node: AdminNode }) {
  if (node.status !== 'ONLINE' || node.uploadRate == null || node.downloadRate == null) return <span>—</span>;
  return <div className="space-y-0.5 whitespace-nowrap text-xs"><div className="text-chart-2">↑ {formatRate(node.uploadRate)}</div><div className="text-chart-1">↓ {formatRate(node.downloadRate)}</div></div>;
}

export default function AdminNodesPage() {
  const [formOpen, setFormOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<AdminNode | null>(null);
  const { data: nodes } = useAdminNodes();
  const { deleteNode, reloadNode } = useNodeMutations();

  return <PageContainer>
    <PageHeader title="节点管理" description="纳管状态、机器遥测与线路承载端口" />
    <div className="flex flex-wrap items-center gap-2"><Button size="sm" className="w-full gap-1.5 sm:w-auto" onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" />添加节点</Button></div>
     <Card><CardContent className="min-w-0 p-0">{(nodes ?? []).length ? <Table className="min-w-[980px]"><TableHeader><TableRow><TableHead>节点</TableHead><TableHead>地址</TableHead><TableHead>承载线路</TableHead><TableHead>端口</TableHead><TableHead>内核</TableHead><TableHead>通信状态</TableHead><TableHead>CPU</TableHead><TableHead>内存</TableHead><TableHead>带宽</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{(nodes ?? []).map((node) => <TableRow key={node.id}>
      <TableCell className="font-medium"><Link to={`/admin/nodes/${node.id}`} className="hover:underline">{node.name}</Link></TableCell>
      <TableCell className="text-muted-foreground">{node.serverHost}</TableCell>
      <TableCell>{node.lines.length ? <div className="flex max-w-52 flex-wrap gap-1">{node.lines.slice(0, 4).map((line) => <Badge key={line.id} variant="outline">{line.protocolType}</Badge>)}{node.lines.length > 4 && <Badge variant="secondary">+{node.lines.length - 4}</Badge>}</div> : <span className="text-xs text-muted-foreground">未承载线路</span>}</TableCell>
      <TableCell className="text-xs tabular-nums">{node.servicePorts.length ? node.servicePorts.slice(0, 3).map((port) => <div key={`${port.lineId}-${port.role}`}>{port.port} · {port.role === 'DIRECT' ? '直连' : port.role === 'TRANSIT' ? '中转' : '落地'}</div>) : '—'}</TableCell>
      <TableCell>{node.kernelRunning == null ? <span className="text-xs text-muted-foreground">—</span> : node.kernelRunning ? <Badge>运行</Badge> : <Badge variant="destructive">停止</Badge>}</TableCell>
       <TableCell><div className="space-y-1"><NodeStatusBadge node={node} /><p className="text-xs text-muted-foreground">{formatLastSeen(node.lastSeenAt)}</p></div></TableCell>
      <TableCell className="tabular-nums">{node.cpuUsage != null ? `${node.cpuUsage.toFixed(1)}%` : '—'}</TableCell><TableCell className="tabular-nums">{node.memoryUsage != null ? `${node.memoryUsage.toFixed(1)}%` : '—'}</TableCell><TableCell className="tabular-nums"><NodeRate node={node} /></TableCell>
      <TableCell><div className="flex justify-end gap-1"><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label="重载配置" disabled={reloadNode.isPending} onClick={() => reloadNode.mutate(node.id)}><RefreshCw className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>重载配置</TooltipContent></Tooltip>{!node.isLocal && <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label="删除" onClick={() => setDeleting(node)}><Trash2 className="text-destructive h-4 w-4" /></Button></TooltipTrigger><TooltipContent>删除</TooltipContent></Tooltip>}<Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label="详情" asChild><Link to={`/admin/nodes/${node.id}`}><ChevronRight className="h-4 w-4" /></Link></Button></TooltipTrigger><TooltipContent>详情</TooltipContent></Tooltip></div></TableCell>
    </TableRow>)}</TableBody></Table> : <EmptyState title="暂无节点" description="添加首个节点后，在 VPS 上执行安装命令即可接入" className="border-0" />}</CardContent></Card>
    <NodeFormDialog open={formOpen} onOpenChange={setFormOpen} />
    <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除节点 {deleting?.name}？</AlertDialogTitle><AlertDialogDescription>该节点的线路承载关系与流量记录将一并删除，在线 Agent 会被断开。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => deleting && deleteNode.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}>删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </PageContainer>;
}
