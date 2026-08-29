import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Server } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { useNodeMutations, type AdminNode, type CreateNodeResult } from '../use-nodes';

const baseSchema = {
  name: z.string().min(1, '请输入节点名称').max(32, '名称不超过 32 字符'),
  serverHost: z.string().min(1, '请输入服务器地址'),
  serverPort: z.coerce.number().int().min(1).max(65535)
};

const createSchema = z.object(baseSchema);
const editSchema = z.object({ ...baseSchema, isPublic: z.boolean() });

type CreateForm = z.infer<typeof createSchema>;
type EditForm = z.infer<typeof editSchema>;

interface NodeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 编辑目标（null=创建） */
  node: AdminNode | null;
}

export function NodeFormDialog({ open, onOpenChange, node }: NodeFormDialogProps) {
  const { createNode, updateNode } = useNodeMutations();
  const isEdit = !!node;
  // 创建成功后的 AgentToken / 安装命令展示（仅创建流程出现）
  const [created, setCreated] = useState<CreateNodeResult | null>(null);

  const createForm = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: '', serverHost: '', serverPort: 443 }
  });

  const editForm = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: { name: '', serverHost: '', serverPort: 443, isPublic: true }
  });

  // 打开时重置到初始状态：创建清空表单与结果页，编辑用目标节点回填
  useEffect(() => {
    if (!open) return;
    if (node) {
      setCreated(null);
      editForm.reset({
        name: node.name,
        serverHost: node.serverHost,
        serverPort: node.serverPort,
        isPublic: node.isPublic
      });
    } else {
      setCreated(null);
      createForm.reset();
    }
  }, [node, open, createForm, editForm]);

  const onCreateSubmit = (v: CreateForm) => {
    createNode.mutate(v, { onSuccess: (data) => setCreated(data) });
  };

  const onEditSubmit = (v: EditForm) => {
    if (!node) return;
    updateNode.mutate(
      { id: node.id, name: v.name, serverHost: v.serverHost, serverPort: v.serverPort, isPublic: v.isPublic },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {isEdit ? (
          <>
            <DialogHeader>
              <DialogTitle>编辑节点 {node?.name}</DialogTitle>
              <DialogDescription>修改后保存，若节点在线将自动下发最新配置</DialogDescription>
            </DialogHeader>
            <Form {...editForm}>
              <form className="space-y-4" onSubmit={editForm.handleSubmit(onEditSubmit)}>
                <FormField
                  control={editForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>节点名称</FormLabel>
                      <FormControl>
                        <Input placeholder="东京节点 01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-3 gap-3">
                  <FormField
                    control={editForm.control}
                    name="serverHost"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>服务器地址</FormLabel>
                        <FormControl>
                          <Input placeholder="203.0.113.10" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="serverPort"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>端口</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={editForm.control}
                  name="isPublic"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <div>
                        <FormLabel>对订阅公开</FormLabel>
                        <FormDescription>关闭后该节点不再出现在用户订阅中</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    取消
                  </Button>
                  <Button type="submit" disabled={updateNode.isPending}>
                    {updateNode.isPending ? '保存中…' : '保存'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </>
        ) : created ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Server className="h-4 w-4" />
                节点「{created.node.name}」已创建
              </DialogTitle>
              <DialogDescription>在 VPS 上执行以下命令完成 Agent 接入</DialogDescription>
            </DialogHeader>
            {/* min-w-0：Dialog 为 grid 布局，截断长文本固有宽度向上传递，避免内容撑出面板 */}
            <div className="min-w-0 space-y-3">
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/50 px-3 py-2 text-xs">{created.agentToken}</code>
                <CopyButton value={created.agentToken} />
              </div>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/50 px-3 py-2 text-xs">{created.installCommand}</code>
                <CopyButton value={created.installCommand} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>完成</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>添加节点</DialogTitle>
              <DialogDescription>创建后生成 AgentToken 与一键安装命令</DialogDescription>
            </DialogHeader>
            <Form {...createForm}>
              <form className="space-y-4" onSubmit={createForm.handleSubmit(onCreateSubmit)}>
                <FormField
                  control={createForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>节点名称</FormLabel>
                      <FormControl>
                        <Input placeholder="东京节点 01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-3 gap-3">
                  <FormField
                    control={createForm.control}
                    name="serverHost"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>服务器地址</FormLabel>
                        <FormControl>
                          <Input placeholder="203.0.113.10" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="serverPort"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>端口</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
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
