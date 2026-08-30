import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { ArrowLeft, Cpu, KeyRound, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { extractErrorMessage } from '@/lib/api';
import { PageContainer } from '@/components/shared/page-container';
import { CopyButton } from '@/components/shared/copy-button';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  PROTOCOL_LABELS,
  useAdminNodeDetail,
  useInboundMutations,
  useNodeMutations,
  type NodeInbound,
  type ProtocolType
} from './use-nodes';
import { InboundFormDialog } from './components/inbound-form-dialog';

// 生成配置只读预览（与 config_sync 下发内容一致的参考实现；实时值以 Agent 应用结果为准）
function GeneratedConfigPreview({ nodeJson }: { nodeJson: string }) {
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-sm">
        按当前入站与用户名单生成的 sing-box 服务端配置参考（只读）
      </p>
      <pre className="bg-muted/50 max-h-[480px] overflow-auto rounded-md border p-3 text-xs leading-relaxed">
        {nodeJson}
      </pre>
    </div>
  );
}

export default function NodeDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();

  const { data: node, isPending, isError } = useAdminNodeDetail(id);
  const { updateNode, deleteNode, reloadNode } = useNodeMutations();
  const { createInbound, updateInbound, deleteInbound, generateKeypair } = useInboundMutations(id);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editingInbound, setEditingInbound] = React.useState<NodeInbound | null>(null);
  const [initialType, setInitialType] = React.useState<ProtocolType>('VLESS');

  // 基础信息编辑（本地态，保存后失效刷新）
  const [name, setName] = React.useState('');
  const [serverHost, setServerHost] = React.useState('');
  const [isPublic, setIsPublic] = React.useState(true);
  const [override, setOverride] = React.useState('');
  React.useEffect(() => {
    if (node) {
      setName(node.name);
      setServerHost(node.serverHost);
      setIsPublic(node.isPublic);
      setOverride(node.configOverride ?? '');
    }
  }, [node]);

  // 生成配置预览（依赖当前节点数据，客户端拼装参考结构）
  const generatedJson = React.useMemo(() => {
    if (!node) return '';
    const inbounds = node.inbounds.map((inbound) => ({
      type: inbound.type.toLowerCase(),
      tag: inbound.tag,
      listen: inbound.listen,
      listen_port: inbound.port,
      params: inbound.params
    }));
    return JSON.stringify(
      { log: { level: 'info', timestamp: true }, inbounds, outbounds: [{ type: 'direct', tag: 'direct' }] },
      null,
      2
    );
  }, [node]);

  const onSaveBasic = () => {
    if (!node) return;
    updateNode.mutate({ id: node.id, name, serverHost, isPublic });
  };

  const onSaveOverride = () => {
    if (!node) return;
    const trimmed = override.trim();
    if (trimmed) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
          throw new Error('not object');
        }
      } catch {
        toast.error('覆盖配置须为合法 JSON 对象');
        return;
      }
      updateNode.mutate({ id: node.id, configOverride: trimmed });
    } else {
      updateNode.mutate({ id: node.id, configOverride: null });
    }
  };

  const onDelete = () => {
    if (!node) return;
    deleteNode.mutate(node.id, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ['admin', 'nodes'] });
        navigate('/admin/nodes');
      }
    });
  };

  if (isPending) {
    return (
      <PageContainer>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-md" />
            <div className="space-y-1.5">
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
        </div>
        <Skeleton className="h-9 w-72 rounded-lg" />
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-8 w-24 rounded-md" />
          </CardHeader>
          <CardContent className="space-y-3 pt-2">
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  if (isError || !node) {
    return (
      <PageContainer>
        <EmptyState title="节点不存在" description="该节点可能已被删除" />
        <Button variant="outline" size="sm" asChild className="mt-2">
          <Link to="/admin/nodes">返回节点列表</Link>
        </Button>
      </PageContainer>
    );
  }

  const statusLabel = node.status === 'ONLINE' ? '在线' : node.status === 'DISABLED' ? '已禁用' : '离线';

  return (
    <PageContainer>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="返回" asChild>
            <Link to="/admin/nodes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{node.name}</h1>
            <p className="text-muted-foreground text-sm">{node.serverHost}</p>
          </div>
          <Badge variant={node.status === 'ONLINE' ? 'default' : 'secondary'}>{statusLabel}</Badge>
        </div>
        <div className="flex gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5" disabled={reloadNode.isPending}>
                <RefreshCw className={cn('h-4 w-4', reloadNode.isPending && 'animate-spin')} />
                {reloadNode.isPending ? '正在下发…' : '重载配置'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>重载节点配置？</AlertDialogTitle>
                <AlertDialogDescription>
                  系统将重新生成服务端 sing-box 配置并向在线 Agent 下发热重载指令。热重载期间活动连接可能会发生短暂重连。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={() => reloadNode.mutate(node.id)}>
                  确认重载
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* 内核状态 / 配置错误告警 */}
      {node.configError && (
        <div className="border-destructive/50 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm">
          <span className="font-medium">配置应用失败：</span>
          <span className="break-all">{node.configError}</span>
        </div>
      )}
      {!node.configError && node.status === 'ONLINE' && node.kernelRunning === false && (
        <div className="border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg border p-3 text-sm">
          Agent 在线但 sing-box 内核未运行（启动失败或持续崩溃，Agent 按退避自动重试）
        </div>
      )}

      <Tabs defaultValue="inbounds">
        <TabsList>
          <TabsTrigger value="inbounds">入站协议</TabsTrigger>
          <TabsTrigger value="basic">基础与遥测</TabsTrigger>
          <TabsTrigger value="advanced">高级与运维</TabsTrigger>
        </TabsList>

        {/* 入站管理 */}
        <TabsContent value="inbounds" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">入站列表（{node.inbounds.length}）</CardTitle>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setEditingInbound(null);
                  setInitialType('VLESS');
                  setFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                添加入站
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {node.inbounds.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>协议</TableHead>
                      <TableHead>Tag</TableHead>
                      <TableHead>监听</TableHead>
                      <TableHead>订阅</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {node.inbounds.map((inbound) => (
                      <TableRow key={inbound.id}>
                        <TableCell>
                          <Badge variant="outline">{PROTOCOL_LABELS[inbound.type]}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">{inbound.tag}</TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {inbound.listen}:{inbound.port}
                        </TableCell>
                        <TableCell>
                          <Badge variant={inbound.isPublic ? 'secondary' : 'outline'}>
                            {inbound.isPublic ? '公开' : '隐藏'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="编辑入站"
                              onClick={() => {
                                setEditingInbound(inbound);
                                setFormOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="删除入站"
                              disabled={deleteInbound.isPending}
                              onClick={() => deleteInbound.mutate(inbound.id)}
                            >
                              <Trash2 className="text-destructive h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState
                  title="暂无入站"
                  description="添加首个入站后，在线 Agent 将自动下发 sing-box 配置"
                  className="border-0"
                />
              )}
            </CardContent>
          </Card>
          <p className="text-muted-foreground text-xs">
            端口冲突规则：同节点同传输层（TCP/UDP）端口互斥，QUIC 系协议（Hysteria2/TUIC）可与 TCP 协议共用端口。
          </p>
        </TabsContent>

        {/* 基础信息 + Agent 接入 */}
        <TabsContent value="basic" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">基础信息</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="node-name">节点名称</Label>
                  <Input id="node-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="node-host">服务器地址</Label>
                  <Input id="node-host" value={serverHost} onChange={(e) => setServerHost(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label>对订阅公开</Label>
                  <p className="text-muted-foreground text-sm">关闭后该节点不出现在用户订阅中</p>
                </div>
                <Switch checked={isPublic} onCheckedChange={setIsPublic} />
              </div>
              <Button size="sm" disabled={updateNode.isPending} onClick={onSaveBasic}>
                {updateNode.isPending ? '保存中…' : '保存'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="h-4 w-4" />
                Agent 接入
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <code className="bg-muted/50 min-w-0 flex-1 truncate rounded-md border px-3 py-2 text-xs">
                  {node.agentToken}
                </code>
                <CopyButton value={node.agentToken} />
              </div>
              <p className="text-muted-foreground text-sm">
                内核状态：
                {node.kernelRunning == null ? (
                  '未知（旧版 Agent 未上报）'
                ) : node.kernelRunning ? (
                  <Badge variant="default" className="ml-1">运行中</Badge>
                ) : (
                  <Badge variant="destructive" className="ml-1">未运行</Badge>
                )}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Cpu className="h-4 w-4" />
                遥测
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-muted-foreground grid grid-cols-3 gap-4 text-sm">
                <span>CPU：{node.cpuUsage != null ? `${node.cpuUsage.toFixed(1)}%` : '—'}</span>
                <span>内存：{node.memoryUsage != null ? `${node.memoryUsage.toFixed(1)}%` : '—'}</span>
                <span>
                  带宽：{node.bandwidthRate != null ? `${(node.bandwidthRate / 1024).toFixed(1)} KB/s` : '—'}
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 高级模式：生成配置预览 / override 编辑 */}
        <TabsContent value="advanced" className="space-y-4">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <Tabs defaultValue="preview">
                <TabsList>
                  <TabsTrigger value="preview">生成配置预览</TabsTrigger>
                  <TabsTrigger value="override">覆盖配置（JSON）</TabsTrigger>
                </TabsList>
                <TabsContent value="preview">
                  <GeneratedConfigPreview nodeJson={generatedJson} />
                </TabsContent>
                <TabsContent value="override" className="space-y-3">
                  <p className="text-muted-foreground text-sm">
                    顶层深合并：嵌套对象按键合并、数组整体替换（提供 inbounds 即覆盖整组入站）。留空清除覆盖。
                  </p>
                  <CodeMirror
                    value={override}
                    height="360px"
                    theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
                    extensions={[json()]}
                    onChange={setOverride}
                    className="overflow-hidden rounded-md border"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={updateNode.isPending} onClick={onSaveOverride}>
                      {updateNode.isPending ? '保存中…' : '保存覆盖配置'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setOverride('')}
                      disabled={!override}
                    >
                      清空
                    </Button>
                  </div>
                  <Separator />
                  <p className="text-muted-foreground text-xs">
                    示例：<code>{'{"log":{"level":"debug"}}'}</code> 调整日志级别；提供 <code>route</code> / <code>outbounds</code> 可完全接管路由与出站。
                  </p>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* 危险操作区 */}
          <Card className="border-destructive/40 bg-destructive/5">
            <CardHeader>
              <CardTitle className="text-base text-destructive flex items-center gap-2">
                <Trash2 className="h-4 w-4" />
                危险操作区
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">删除此节点</p>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    删除后该节点的全部入站协议配置与关联流量记录将永久清空，在线 Agent 将立即断开并注销连接。
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="gap-1.5 shrink-0" disabled={deleteNode.isPending}>
                      <Trash2 className="h-4 w-4" />
                      {deleteNode.isPending ? '正在删除…' : '删除节点'}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>确认删除节点「{node.name}」？</AlertDialogTitle>
                      <AlertDialogDescription>
                        该操作不可撤销。所有属于该节点的入站协议与流量记录将被一并清除，正在连接的用户连接将被强制中断。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={onDelete}>
                        确认删除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <InboundFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        inbound={editingInbound}
        initialType={initialType}
        onCreate={(payload) =>
          createInbound.mutate(payload, { onSuccess: () => setFormOpen(false) })
        }
        onUpdate={(inboundId, payload) =>
          updateInbound.mutate(
            { inboundId, ...payload },
            { onSuccess: () => setFormOpen(false) }
          )
        }
        onGenerateKeypair={async () => {
          try {
            return await generateKeypair.mutateAsync();
          } catch (e) {
            toast.error(extractErrorMessage(e, '生成失败'));
            throw e;
          }
        }}
        pending={createInbound.isPending || updateInbound.isPending}
      />
    </PageContainer>
  );
}
