import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import { Plus, RefreshCw, Server } from 'lucide-react';
import { api, extractErrorMessage } from '@/lib/api';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { CopyButton } from '@/components/shared/copy-button';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';

interface AdminNode {
  id: string;
  name: string;
  serverHost: string;
  serverPort: number;
  protocol: string;
  status: string;
  lastSeenAt: string | null;
  cpuUsage: number | null;
  memoryUsage: number | null;
  bandwidthRate: number | null;
  agentToken: string;
}

const createNodeSchema = z.object({
  name: z.string().min(1, '请输入节点名称').max(32, '名称不超过 32 字符'),
  serverHost: z.string().min(1, '请输入服务器地址'),
  serverPort: z.coerce.number().int().min(1).max(65535)
});

type CreateNodeForm = z.infer<typeof createNodeSchema>;

interface CreateNodeResult {
  node: { id: string; name: string };
  agentToken: string;
  installCommand: string;
}

export default function AdminNodesPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [created, setCreated] = React.useState<CreateNodeResult | null>(null);

  // 5 秒轮询：实时观察 Agent 在线状态与负载
  const nodesQuery = useQuery({
    queryKey: ['admin', 'nodes'],
    queryFn: async () => (await api.get<AdminNode[]>('/admin/nodes')).data,
    refetchInterval: 5_000
  });

  const reloadMutation = useMutation({
    mutationFn: async (nodeId: string) => (await api.post(`/admin/nodes/${nodeId}/reload`)).data,
    onSuccess: (data) => {
      toast.success(data.requested ? '已下发配置重载指令' : '节点不在线，稍后连接时自动同步');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'nodes'] });
    },
    onError: (e) => toast.error(extractErrorMessage(e, '重载失败'))
  });

  const form = useForm<CreateNodeForm>({
    resolver: zodResolver(createNodeSchema),
    defaultValues: { name: '', serverHost: '', serverPort: 443 }
  });

  const createMutation = useMutation({
    mutationFn: async (values: CreateNodeForm) =>
      (await api.post<CreateNodeResult>('/admin/nodes', values)).data,
    onSuccess: (data) => {
      setCreated(data);
      form.reset();
      void queryClient.invalidateQueries({ queryKey: ['admin', 'nodes'] });
    },
    onError: (e) => toast.error(extractErrorMessage(e, '创建失败'))
  });

  const onSubmit = (values: CreateNodeForm) => createMutation.mutate(values);

  const nodes = nodesQuery.data ?? [];

  return (
    <PageContainer>
      <PageHeader title="节点管理" description="纳管状态、遥测负载与配置下发" />
      <div className="flex items-center gap-2">
        <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          添加节点
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {nodes.length ? (
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
                {nodes.map((n) => (
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
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={reloadMutation.isPending}
                        onClick={() => reloadMutation.mutate(n.id)}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        重载配置
                      </Button>
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

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setCreated(null); }}>
        <DialogContent className="sm:max-w-lg">
          {!created ? (
            <>
              <DialogHeader>
                <DialogTitle>添加节点</DialogTitle>
                <DialogDescription>创建后生成 AgentToken 与一键安装命令</DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none" htmlFor="node-name">节点名称</label>
                  <input
                    id="node-name"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder="东京节点 01"
                    {...form.register('name')}
                  />
                  {form.formState.errors.name ? (
                    <p className="text-destructive text-sm">{form.formState.errors.name.message}</p>
                  ) : null}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-2">
                    <label className="text-sm font-medium leading-none" htmlFor="node-host">服务器地址</label>
                    <input
                      id="node-host"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="203.0.113.10"
                      {...form.register('serverHost')}
                    />
                    {form.formState.errors.serverHost ? (
                      <p className="text-destructive text-sm">{form.formState.errors.serverHost.message}</p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none" htmlFor="node-port">端口</label>
                    <input
                      id="node-port"
                      type="number"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      {...form.register('serverPort')}
                    />
                    {form.formState.errors.serverPort ? (
                      <p className="text-destructive text-sm">{form.formState.errors.serverPort.message}</p>
                    ) : null}
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? '创建中…' : '创建'}
                  </Button>
                </DialogFooter>
              </form>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  节点「{created.node.name}」已创建
                </DialogTitle>
                <DialogDescription>在 VPS 上执行以下命令完成 Agent 接入</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">AgentToken</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded-md border bg-muted/50 px-3 py-2 text-xs">{created.agentToken}</code>
                    <CopyButton value={created.agentToken} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">一键安装命令</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded-md border bg-muted/50 px-3 py-2 text-xs">{created.installCommand}</code>
                    <CopyButton value={created.installCommand} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => { setCreateOpen(false); setCreated(null); }}>完成</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
