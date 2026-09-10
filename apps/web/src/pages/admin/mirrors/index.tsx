import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Copy, Pencil, Plus, RefreshCw, RotateCcw, Trash2, Wifi } from 'lucide-react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { EmptyState } from '@/components/shared/empty-state';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/shared/responsive-dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useFormResetOnKey } from '@/hooks/use-form-reset';
import { useAdminNodes } from '@/pages/admin/nodes/use-nodes';
import { useMirrorMutations, useAdminMirrors, type ApiMirror, type MirrorAccessMode, type MirrorPayload } from './use-mirrors';

const accessLabels: Record<MirrorAccessMode, string> = { ADMIN: '管理员', SHARE: '分享 Token', PUBLIC: '公开' };

const mirrorFormSchema = z.object({
  name: z.string().trim().min(1, '请输入镜像站名称').max(64, '名称最多 64 个字符'),
  slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{2,62}$/, 'Slug 为 3-63 位小写字母、数字或连字符，且以字母或数字开头'),
  upstreamBaseUrl: z.string().trim().regex(/^https?:\/\//i, '上游基址需以 http:// 或 https:// 开头'),
  allowedOrigins: z.string().trim().min(1, '请至少填写一个允许的上游域名'),
  nodeId: z.string().trim().min(1, '请选择出网节点'),
  accessMode: z.enum(['ADMIN', 'SHARE', 'PUBLIC']),
  enabled: z.boolean(),
  shareExpiresAt: z.string()
});

type MirrorFormValues = z.infer<typeof mirrorFormSchema>;

function emptyMirrorFormValues(): MirrorFormValues {
  return { name: '', slug: '', upstreamBaseUrl: '', allowedOrigins: '', nodeId: '', accessMode: 'ADMIN', enabled: false, shareExpiresAt: '' };
}

function mirrorToFormValues(mirror: ApiMirror): MirrorFormValues {
  return {
    name: mirror.name,
    slug: mirror.slug,
    upstreamBaseUrl: mirror.upstreamBaseUrl,
    allowedOrigins: mirror.allowedOrigins.join('\n'),
    nodeId: mirror.nodeId,
    accessMode: mirror.accessMode,
    enabled: mirror.enabled,
    shareExpiresAt: mirror.shareExpiresAt ? mirror.shareExpiresAt.slice(0, 16) : ''
  };
}

function MirrorForm({ open, editing, nodes, pending, onOpenChange, onSubmit }: { open: boolean; editing: ApiMirror | null; nodes: ReturnType<typeof useAdminNodes>['data']; pending: boolean; onOpenChange: (open: boolean) => void; onSubmit: (payload: MirrorPayload) => void }) {
  const availableNodes = React.useMemo(
    () => (nodes ?? []).filter((node) => node.communicationMode === 'WS' && node.status === 'ONLINE' && node.supportsMirrorProxy),
    [nodes]
  );
  const form = useForm<MirrorFormValues>({
    resolver: zodResolver(mirrorFormSchema),
    defaultValues: emptyMirrorFormValues()
  });

  // 仅在“打开弹窗 / 切换编辑对象”时初始化草稿：出网节点列表每 5 秒轮询，
  // 但绝不允许它的刷新回写用户正在输入的内容（规范见 FRONTEND_UI_GUIDELINES §5）
  useFormResetOnKey({
    open,
    resetKey: editing?.id ?? 'create',
    reset: () => form.reset(editing ? mirrorToFormValues(editing) : emptyMirrorFormValues())
  });

  // 实时数据只做非破坏性补默认值：用户尚未选择节点时补第一个可用节点
  React.useEffect(() => {
    if (!open) return;
    const firstAvailable = availableNodes[0]?.id;
    if (firstAvailable && !form.getValues('nodeId')) form.setValue('nodeId', firstAvailable);
  }, [availableNodes, form, open]);

  const accessMode = form.watch('accessMode');
  const nodeId = form.watch('nodeId');
  const selectedNodeMissing = Boolean(nodeId) && !availableNodes.some((node) => node.id === nodeId);

  const submit = form.handleSubmit((values) => onSubmit({
    name: values.name.trim(),
    slug: values.slug.trim().toLowerCase(),
    upstreamBaseUrl: values.upstreamBaseUrl.trim(),
    allowedOrigins: values.allowedOrigins.split(/[\n,]/).map((item) => item.trim()).filter(Boolean),
    nodeId: values.nodeId,
    accessMode: values.accessMode,
    enabled: values.enabled,
    ...(values.accessMode === 'SHARE' && values.shareExpiresAt ? { shareExpiresAt: new Date(values.shareExpiresAt).toISOString() } : {})
  }));

  return <ResponsiveDialog open={open} onOpenChange={onOpenChange}><ResponsiveDialogContent size="wide"><DialogHeader><DialogTitle>{editing ? '编辑镜像站' : '新增镜像站'}</DialogTitle><DialogDescription>固定一个公开上游，并指定具备 WS 镜像能力的出网节点。</DialogDescription></DialogHeader>
    <Form {...form}>
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField control={form.control} name="name" render={({ field }) => (
            <FormItem><FormLabel>名称</FormLabel><FormControl><Input placeholder="GitHub Raw" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="slug" render={({ field }) => (
            <FormItem><FormLabel>Slug</FormLabel><FormControl><Input placeholder="github-raw" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <FormField control={form.control} name="upstreamBaseUrl" render={({ field }) => (
          <FormItem><FormLabel>上游基址</FormLabel><FormControl><Input type="url" placeholder="https://raw.githubusercontent.com" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="allowedOrigins" render={({ field }) => (
          <FormItem>
            <FormLabel>允许的上游域名</FormLabel>
            <FormControl><Textarea rows={3} placeholder={'raw.githubusercontent.com\nobjects.githubusercontent.com'} {...field} /></FormControl>
            <FormDescription>每行一个域名，重定向只能落在这些域名内。</FormDescription>
            <FormMessage />
          </FormItem>
        )} />
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField control={form.control} name="nodeId" render={({ field }) => (
            <FormItem>
              <FormLabel>出网节点</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue placeholder="选择在线 WS 节点" /></SelectTrigger></FormControl>
                <SelectContent>{availableNodes.map((node) => <SelectItem key={node.id} value={node.id}>{node.name} · {node.serverHost}</SelectItem>)}</SelectContent>
              </Select>
              {!availableNodes.length && <p className="text-xs text-destructive">暂无可用节点，请先升级支持镜像代理的 Agent。</p>}
              {selectedNodeMissing && <p className="text-xs text-destructive">当前选择的节点已离线或不再支持镜像代理，请重新选择。</p>}
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="accessMode" render={({ field }) => (
            <FormItem>
              <FormLabel>访问策略</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="ADMIN">管理员会话</SelectItem>
                  <SelectItem value="SHARE">分享 Token</SelectItem>
                  <SelectItem value="PUBLIC">公开访问</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        </div>
        {accessMode === 'SHARE' && (
          <FormField control={form.control} name="shareExpiresAt" render={({ field }) => (
            <FormItem><FormLabel>分享有效期（可选）</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        )}
        <FormField control={form.control} name="enabled" render={({ field }) => (
          <FormItem className="flex items-center justify-between rounded-md border p-3">
            <div><FormLabel>启用镜像站</FormLabel><FormDescription>首次上线建议先使用管理员或分享模式验证。</FormDescription></div>
            <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
          </FormItem>
        )} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button type="submit" disabled={!availableNodes.length || pending}>{pending ? '保存中…' : editing ? '保存镜像站' : '创建镜像站'}</Button>
        </DialogFooter>
      </form>
    </Form>
  </ResponsiveDialogContent></ResponsiveDialog>;
}

export default function AdminMirrorsPage() {
  const { data, isPending, isError } = useAdminMirrors();
  const { data: nodes } = useAdminNodes();
  const mutations = useMirrorMutations();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ApiMirror | null>(null);
  const [deleting, setDeleting] = React.useState<ApiMirror | null>(null);
  const [shareToken, setShareToken] = React.useState<string | null>(null);
  const [testResult, setTestResult] = React.useState<Record<string, unknown> | null>(null);
  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const submit = (payload: MirrorPayload) => {
    const onSuccess = (result: { shareToken?: string }) => { if (result.shareToken) setShareToken(result.shareToken); setFormOpen(false); };
    if (editing) mutations.update.mutate({ id: editing.id, ...payload }, { onSuccess });
    else mutations.create.mutate(payload, { onSuccess });
  };
  if (isPending) return <PageContainer><PageHeader title="镜像站" description="通过指定节点实时访问固定上游资源。" /><p className="text-sm text-muted-foreground">加载中…</p></PageContainer>;
  if (isError) return <PageContainer><PageHeader title="镜像站" /><EmptyState title="无法加载镜像站" description="请稍后刷新重试。" /></PageContainer>;
  const items = data?.items ?? [];
  return <PageContainer><PageHeader title="镜像站" description="通过指定节点实时访问 GitHub Raw、API 和 Release 等公开资源。" /><div className="flex flex-wrap justify-end gap-2"><Button onClick={openCreate}><Plus />新增镜像站</Button></div><Card><CardContent className="min-w-0 p-0">{items.length ? <Table className="min-w-[980px]"><TableHeader><TableRow><TableHead>镜像站</TableHead><TableHead>上游</TableHead><TableHead>出网节点</TableHead><TableHead>访问策略</TableHead><TableHead>状态</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{items.map((mirror) => <TableRow key={mirror.id}><TableCell><div className="font-medium">{mirror.name}</div><div className="font-mono text-xs text-muted-foreground">/mirror/{mirror.slug}</div></TableCell><TableCell className="max-w-64 truncate text-sm">{mirror.upstreamBaseUrl}</TableCell><TableCell><div>{mirror.node.name}</div><div className="flex items-center gap-1 text-xs text-muted-foreground"><Wifi className="size-3" />{mirror.node.status === 'ONLINE' && mirror.node.supportsMirrorProxy ? 'WS 镜像可用' : '暂不可用'}</div></TableCell><TableCell><Badge variant={mirror.accessMode === 'PUBLIC' ? 'outline' : 'secondary'}>{accessLabels[mirror.accessMode]}</Badge></TableCell><TableCell><Badge variant={mirror.enabled ? 'default' : 'secondary'}>{mirror.enabled ? '已启用' : '已停用'}</Badge>{mirror.lastErrorCode && <div className="mt-1 text-xs text-destructive">{mirror.lastErrorCode}</div>}</TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" aria-label="测试镜像站" title="测试镜像站" disabled={mutations.test.isPending} onClick={() => mutations.test.mutate(mirror.id, { onSuccess: setTestResult })}><RefreshCw /></Button>{mirror.accessMode === 'SHARE' && <Button variant="ghost" size="icon" aria-label="轮换分享 Token" title="轮换分享 Token" onClick={() => mutations.rotate.mutate(mirror.id, { onSuccess: (result) => setShareToken(result.shareToken) })}><RotateCcw /></Button>}<Button variant="ghost" size="icon" aria-label="编辑镜像站" title="编辑镜像站" onClick={() => { setEditing(mirror); setFormOpen(true); }}><Pencil /></Button><Button variant="ghost" size="icon" aria-label="删除镜像站" title="删除镜像站" onClick={() => setDeleting(mirror)}><Trash2 className="text-destructive" /></Button></div></TableCell></TableRow>)}</TableBody></Table> : <EmptyState title="暂无镜像站" description="创建镜像站后即可通过指定节点实时访问固定上游。" className="border-0" />}</CardContent></Card><MirrorForm open={formOpen} editing={editing} nodes={nodes} pending={mutations.create.isPending || mutations.update.isPending} onOpenChange={setFormOpen} onSubmit={submit} /><AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除「{deleting?.name}」？</AlertDialogTitle><AlertDialogDescription>删除后镜像地址和分享 Token 立即失效，进行中的请求会被终止。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => deleting && mutations.remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}>确认删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog><ResponsiveDialog open={!!shareToken} onOpenChange={(open) => !open && setShareToken(null)}><ResponsiveDialogContent size="compact"><DialogHeader><DialogTitle>分享地址 Token</DialogTitle><DialogDescription>明文 Token 只在本次操作中展示；关闭后请使用轮换功能重新生成。</DialogDescription></DialogHeader><div className="space-y-2"><Label>Token</Label><div className="flex gap-2"><Input readOnly value={shareToken ?? ''} className="font-mono text-xs" /><Button size="icon" aria-label="复制 Token" title="复制 Token" onClick={() => shareToken && void navigator.clipboard.writeText(`${window.location.origin}/mirror/share/${shareToken}`)}><Copy /></Button></div><p className="break-all text-xs text-muted-foreground">{window.location.origin}/mirror/share/{shareToken}</p></div><DialogFooter><Button onClick={() => setShareToken(null)}>关闭</Button></DialogFooter></ResponsiveDialogContent></ResponsiveDialog><ResponsiveDialog open={!!testResult} onOpenChange={(open) => !open && setTestResult(null)}><ResponsiveDialogContent size="compact"><DialogHeader><DialogTitle>镜像测试结果</DialogTitle><DialogDescription>测试只发送受限 HEAD 请求，不会保存上游响应体。</DialogDescription></DialogHeader><div className="grid gap-2 text-sm"><div className="flex justify-between gap-4"><span className="text-muted-foreground">结果</span><span>{testResult?.success ? '成功' : '失败'}</span></div>{Object.entries(testResult ?? {}).filter(([key]) => key !== 'success').map(([key, value]) => <div key={key} className="flex justify-between gap-4"><span className="text-muted-foreground">{key}</span><span className="break-all text-right">{String(value)}</span></div>)}</div><DialogFooter><Button onClick={() => setTestResult(null)}>关闭</Button></DialogFooter></ResponsiveDialogContent></ResponsiveDialog></PageContainer>;
}
