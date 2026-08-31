import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Server } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/shared/copy-button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
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
import { useNodeMutations, type CreateNodeResult } from '../use-nodes';

// 创建只收基础信息：协议/端口等入站配置进节点详情页单独管理
const createSchema = z.object({
  name: z.string().max(32, '名称不超过 32 字符').optional(),
  serverHost: z.string().min(1, '请输入服务器地址')
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

  const createForm = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: '', serverHost: '' }
  });

  // 打开时重置到初始状态
  useEffect(() => {
    if (open) {
      setCreated(null);
      createForm.reset();
    }
  }, [open, createForm]);

  const onCreateSubmit = (v: CreateForm) => {
    createNode.mutate(
      { name: v.name?.trim() || undefined, serverHost: v.serverHost },
      { onSuccess: (data) => setCreated(data) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
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
              <div className="flex items-center gap-2">
                <code className="bg-muted/50 min-w-0 flex-1 truncate rounded-md border px-3 py-2 text-xs">{created.agentToken}</code>
                <CopyButton value={created.agentToken} />
              </div>
              <div className="flex items-center gap-2">
                <code className="bg-muted/50 min-w-0 flex-1 truncate rounded-md border px-3 py-2 text-xs">{created.installCommand}</code>
                <CopyButton value={created.installCommand} />
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
                  name="serverHost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>服务器地址</FormLabel>
                      <FormControl>
                        <Input placeholder="203.0.113.10" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
      </DialogContent>
    </Dialog>
  );
}
