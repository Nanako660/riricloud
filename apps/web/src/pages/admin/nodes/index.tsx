import * as React from 'react';
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { useAdminNodes, useNodeMutations, type AdminNode } from './use-nodes';
import { NodeFormDialog } from './components/node-form-dialog';

export default function AdminNodesPage() {
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AdminNode | null>(null);
  const [deleting, setDeleting] = React.useState<AdminNode | null>(null);

  // 5 秒轮询：实时观察 Agent 在线状态与负载
  const { data: nodes } = useAdminNodes();
  const { deleteNode, reloadNode } = useNodeMutations();

  const onConfirmDelete = () => {
    if (!deleting) return;
    deleteNode.mutate(deleting.id, {
      onSuccess: () => setDeleting(null),
      onError: () => setDeleting(null)
    });
  };

  return (
    <PageContainer>
      <PageHeader title="节点管理" description="纳管状态、遥测负载与配置下发" />
      <div className="flex items-center gap-2">
        <Button size="sm" className="gap-1.5" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" />
          添加节点
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {(nodes ?? []).length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>节点</TableHead>
                  <TableHead>地址</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>CPU</TableHead>
                  <TableHead>内存</TableHead>
                  <TableHead>带宽</TableHead>
                  <TableHead>最近心跳</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(nodes ?? []).map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="font-medium">{n.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {n.serverHost}:{n.serverPort}
                    </TableCell>
                    <TableCell>
                      <Badge variant={n.status === 'ONLINE' ? 'default' : 'secondary'}>
                        {n.status === 'ONLINE' ? '在线' : n.status === 'DISABLED' ? '已禁用' : '离线'}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">{n.cpuUsage != null ? `${n.cpuUsage.toFixed(1)}%` : '—'}</TableCell>
                    <TableCell className="tabular-nums">{n.memoryUsage != null ? `${n.memoryUsage.toFixed(1)}%` : '—'}</TableCell>
                    <TableCell className="tabular-nums">{n.bandwidthRate != null ? `${(n.bandwidthRate / 1024).toFixed(1)} KB/s` : '—'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {n.lastSeenAt ? new Date(n.lastSeenAt).toLocaleString('zh-CN') : '从未上线'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="重载配置"
                              disabled={reloadNode.isPending}
                              onClick={() => reloadNode.mutate(n.id)}
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>重载配置</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="编辑" onClick={() => { setEditing(n); setFormOpen(true); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>编辑</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="删除" onClick={() => setDeleting(n)}>
                              <Trash2 className="text-destructive h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>删除</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title="暂无节点"
              description="添加首个节点后，在 VPS 上执行安装命令即可接入"
              className="border-0"
            />
          )}
        </CardContent>
      </Card>

      <NodeFormDialog open={formOpen} onOpenChange={setFormOpen} node={editing} />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除节点 {deleting?.name}？</AlertDialogTitle>
            <AlertDialogDescription>
              该节点的流量记录将一并删除，在线 Agent 会被断开且无法再接入，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void onConfirmDelete()}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
