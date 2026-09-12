import { useMemo, useState } from 'react';
import { useFormResetOnKey } from '@/hooks/use-form-reset';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Server } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/shared/copy-button';
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/shared/responsive-dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNodeMutations, type CommunicationMode, type CreateNodeResult } from '../use-nodes';

// 创建只收基础信息：协议/端口等入站配置进节点详情页单独管理
const createSchema = z.object({
  name: z.string().max(32, '名称不超过 32 字符').optional(),
  reachability: z.enum(['PUBLIC', 'NAT']),
  serverHost: z.string().optional(),
  communicationMode: z.enum(['WS', 'HTTP'])
}).refine((data) => {
  if (data.reachability === 'PUBLIC') {
    return Boolean(data.serverHost && data.serverHost.trim().length > 0);
  }
  return true;
}, {
  message: '公网 VPS 必须输入服务器公网地址',
  path: ['serverHost']
});

type CreateForm = z.infer<typeof createSchema>;

interface NodeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NodeFormDialog({ open, onOpenChange }: NodeFormDialogProps) {
  const navigate = useNavigate();
  const { createNode } = useNodeMutations();
  // 创建成功后的 AgentToken / 安装命令展示（仅创建流程出现）
  const [created, setCreated] = useState<CreateNodeResult | null>(null);
  const [installMode, setInstallMode] = useState<CommunicationMode>('WS');
  const [deployType, setDeployType] = useState<'native' | 'docker'>('native');

  const createForm = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: '', reachability: 'PUBLIC', serverHost: '', communicationMode: 'WS' }
  });

  // 打开时重置到初始状态
  useFormResetOnKey({
    open,
    resetKey: 'create',
    reset: () => {
      setCreated(null);
      setInstallMode('WS');
      setDeployType('native');
      createForm.reset({ name: '', reachability: 'PUBLIC', serverHost: '', communicationMode: 'WS' });
    }
  });

  const currentCommand = useMemo(() => {
    if (!created) return '';
    if (deployType === 'docker') {
      return installMode === 'HTTP'
        ? (created.installCommands?.dockerHttp ?? '')
        : (created.installCommands?.dockerWs ?? '');
    }
    return created.installCommands?.[installMode === 'HTTP' ? 'http' : 'ws'] ?? created.installCommand ?? '';
  }, [created, deployType, installMode]);

  const onCreateSubmit = (v: CreateForm) => {
    createNode.mutate(
       {
         name: v.name?.trim() || undefined,
         reachability: v.reachability,
         serverHost: v.reachability === 'NAT' ? (v.serverHost?.trim() || '127.0.0.1') : v.serverHost?.trim(),
         communicationMode: v.communicationMode
       },
       { onSuccess: (data) => { setInstallMode(v.communicationMode); setCreated(data); } }
    );
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Server className="h-4 w-4" />
                节点「{created.node.name}」已创建
              </DialogTitle>
              <DialogDescription>
                在 VPS 上执行以下命令完成 Agent 接入；入站协议请在节点详情页配置
              </DialogDescription>
            </DialogHeader>
            {/* min-w-0：Dialog 为 grid 布局，截断长文本固有宽度向上传递，避免内容撑出面板 */}
            <div className="min-w-0 space-y-3">
              <Tabs value={deployType} onValueChange={(value) => setDeployType(value === 'docker' ? 'docker' : 'native')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="native">原生 CLI</TabsTrigger>
                  <TabsTrigger value="docker">Docker 容器</TabsTrigger>
                </TabsList>
              </Tabs>
              <Tabs value={installMode.toLowerCase()} onValueChange={(value) => setInstallMode(value === 'http' ? 'HTTP' : 'WS')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="ws">WS / WSS</TabsTrigger>
                  <TabsTrigger value="http">HTTP / HTTPS 轮询</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex items-center gap-2">
                <code className="bg-muted/50 min-w-0 flex-1 truncate rounded-md border px-3 py-2 text-xs">{created.agentToken}</code>
                <CopyButton value={created.agentToken} />
              </div>
              <div className="flex items-center gap-2">
                <code className="bg-muted/50 min-w-0 flex-1 truncate rounded-md border px-3 py-2 text-xs">{currentCommand}</code>
                <CopyButton value={currentCommand} />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  navigate(`/admin/nodes/${created.node.id}`);
                }}
              >
                前往配置入站
              </Button>
              <Button onClick={() => onOpenChange(false)}>完成</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>添加节点</DialogTitle>
              <DialogDescription>创建后生成 AgentToken 与一键安装命令，入站协议随后在详情页配置</DialogDescription>
            </DialogHeader>
            <Form {...createForm}>
              <form className="space-y-4" onSubmit={createForm.handleSubmit(onCreateSubmit)}>
                <FormField
                  control={createForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>节点名称（可选）</FormLabel>
                      <FormControl>
                        <Input placeholder="东京节点 01" {...field} />
                      </FormControl>
                      <FormDescription>留空时按服务器地址生成</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="reachability"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>网络可达性</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(val) => {
                          field.onChange(val);
                          if (val === 'NAT' && !createForm.getValues('serverHost')) {
                            createForm.setValue('serverHost', '127.0.0.1');
                          }
                        }}
                      >
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="PUBLIC">公网 VPS (独立公网 IPv4 / IPv6，可作为直连或中继)</SelectItem>
                          <SelectItem value="NAT">内网 NAT 主机 (家宽 NAS、软路由、无公网 IP，作为反向中继落地)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {field.value === 'NAT'
                          ? '此主机无公网 IP，通过反向多路复用隧道由入口 VPS 中继纳管，仅作为中继落地节点。'
                          : '具备公网 IP 的独立服务器，可作为直连节点或中继入口/落地节点。'}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="communicationMode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>通信模式</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="WS">WS / WSS 长连接</SelectItem>
                          <SelectItem value="HTTP">HTTP / HTTPS 轮询</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>HTTP 模式适合不支持 WebSocket 升级的网络环境</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {createForm.watch('reachability') === 'PUBLIC' ? (
                  <FormField
                    control={createForm.control}
                    name="serverHost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>服务器公网地址</FormLabel>
                        <FormControl>
                          <Input placeholder="203.0.113.10 或 vps.example.com" {...field} />
                        </FormControl>
                        <FormDescription>客户端或中继节点连接此主机的公网 IP 或域名</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <FormField
                    control={createForm.control}
                    name="serverHost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>内网标识地址（可选）</FormLabel>
                        <FormControl>
                          <Input placeholder="127.0.0.1 或 nas.lan" {...field} />
                        </FormControl>
                        <FormDescription>无公网 IP 时用于控制台显示标识，默认填 127.0.0.1</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    取消
                  </Button>
                  <Button type="submit" disabled={createNode.isPending}>
                    {createNode.isPending ? '创建中…' : '创建'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
