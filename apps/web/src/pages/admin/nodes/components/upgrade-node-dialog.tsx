import { useFormResetOnKey } from '@/hooks/use-form-reset';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/shared/responsive-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AdminBinaryInfo, AdminNode } from '../use-nodes';
import type { BinaryResource } from '../../binaries/use-binaries';

const schema = z.object({
  target: z.literal('agent').default('agent'),
  source: z.enum(['master', 'custom']),
  resourceId: z.string().optional(),
  version: z.string().optional(),
  url: z.string().optional(),
  sha256: z.string().optional()
}).superRefine((value, context) => {
  if (value.source === 'custom') {
    if (!value.version?.trim()) context.addIssue({ code: z.ZodIssueCode.custom, path: ['version'], message: '请输入自定义版本号' });
    if (!value.url || !/^https?:\/\//i.test(value.url)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['url'], message: '请输入完整下载地址' });
    if (!value.sha256 || !/^[a-f0-9]{64}$/i.test(value.sha256)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['sha256'], message: 'SHA-256 必须是 64 位十六进制' });
  }
});

type Values = z.infer<typeof schema>;

function normalizeArch(value: string | null) {
  if (!value) return '';
  return value.toLowerCase().replace('/', '-').replace('x86_64', 'amd64').replace('aarch64', 'arm64');
}

export function UpgradeNodeDialog({ open, onOpenChange, pending, importing, node, binaryInfo, resources, onSubmit, onImport }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  importing: boolean;
  node: Pick<AdminNode, 'osArch' | 'agentVersion' | 'kernelVersion'>;
  binaryInfo?: AdminBinaryInfo;
  resources?: BinaryResource[];
  onSubmit: (values: { target: 'agent'; resourceId?: string; version?: string; url?: string; sha256?: string }) => void;
  onImport: (values: { target: string; version: string; url: string; sha256: string }) => void;
}) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { target: 'agent', source: 'master', resourceId: '', version: '', url: '', sha256: '' }
  });
  const source = form.watch('source');
  const platform = normalizeArch(node.osArch);
  const builtIn = binaryInfo?.targets.find((item) => item.kind === 'agent' && item.target.endsWith(platform));
  const resourceId = form.watch('resourceId');
  const resourceOptions = resources?.filter((item) => item.kind === 'AGENT' && item.status === 'ACTIVE' && item.assets.some((asset) => asset.target === `agent-${platform}`)) ?? [];
  const selectedResource = resourceOptions.find((item) => item.id === resourceId);

  useFormResetOnKey({
    open,
    resetKey: 'upgrade',
    reset: () => form.reset({ target: 'agent', source: 'master', resourceId: '', version: '', url: '', sha256: '' })
  });

  const submit = (values: Values) => onSubmit({
    target: 'agent',
    ...(values.source === 'master' && values.resourceId ? { resourceId: values.resourceId } : {}),
    ...(values.version?.trim() ? { version: values.version.trim() } : {}),
    ...(values.source === 'custom' ? { url: values.url?.trim(), sha256: values.sha256?.trim().toLowerCase() } : {})
  });

  return <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
    <ResponsiveDialogContent size="compact">
      <DialogHeader>
        <DialogTitle>节点升级中心</DialogTitle>
        <DialogDescription>Sing-box 内核已内嵌封装于 Agent 中，升级 Agent 将自动无缝更新内核。</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
        <div className="space-y-2">
          <Label>文件来源</Label>
          <Controller control={form.control} name="source" render={({ field }) => <Select value={field.value} onValueChange={field.onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="master">主控内置版本</SelectItem><SelectItem value="custom">自定义地址</SelectItem></SelectContent></Select>} />
        </div>
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">当前 Agent：</span>
            <span className="font-medium">{node.agentVersion || '未上报'}</span>
            <span className="text-muted-foreground ml-2">托管内核：</span>
            <span className="font-medium">{node.kernelVersion || '未上报'}</span>
            {source === 'master' && <>
              <span className="text-muted-foreground ml-2">可用资源：</span>
              <Badge variant={selectedResource || builtIn?.available ? 'default' : 'secondary'}>{selectedResource?.version || builtIn?.version || '未找到对应架构'}</Badge>
            </>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">运行平台：{node.osArch || '等待 Agent 首次上报'}</p>
        </div>
        {source === 'master' && <div className="space-y-2"><Label>资源版本</Label><Controller control={form.control} name="resourceId" render={({ field }) => <Select value={field.value || undefined} onValueChange={field.onChange}><SelectTrigger><SelectValue placeholder={resourceOptions.length ? '选择 ACTIVE 资源' : '使用默认资源'} /></SelectTrigger><SelectContent>{resourceOptions.map((item) => <SelectItem key={item.id} value={item.id}>{item.version}{item.isDefault ? ' · 默认' : ''} · {item.assets.length} 个平台资产</SelectItem>)}</SelectContent></Select>} /><p className="text-xs text-muted-foreground">仅显示匹配当前节点平台且状态为 ACTIVE 的资源。</p></div>}
        <div className="space-y-2">
          <Label htmlFor="upgrade-version">版本号{source === 'master' ? '（留空使用主控版本）' : ''}</Label>
          <Input id="upgrade-version" placeholder={source === 'master' ? (builtIn?.version || '主控内置版本') : '1.11.0'} {...form.register('version')} />
          {form.formState.errors.version && <p className="text-xs text-destructive">{form.formState.errors.version.message}</p>}
        </div>
        {source === 'custom' && <>
          <div className="space-y-2"><Label htmlFor="upgrade-url">下载 URL</Label><Input id="upgrade-url" type="url" placeholder="https://downloads.example.com/riri-agent" {...form.register('url')} />{form.formState.errors.url && <p className="text-xs text-destructive">{form.formState.errors.url.message}</p>}</div>
          <div className="space-y-2"><Label htmlFor="upgrade-sha">SHA-256</Label><Input id="upgrade-sha" className="font-mono text-xs" placeholder="64 位十六进制摘要" {...form.register('sha256')} />{form.formState.errors.sha256 && <p className="text-xs text-destructive">{form.formState.errors.sha256.message}</p>}</div>
        </>}
        <DialogFooter className="gap-2 sm:gap-0"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>{source === 'custom' && <Button type="button" variant="secondary" disabled={importing} onClick={() => void form.handleSubmit((values) => values.version && values.url && values.sha256 && onImport({ target: `agent-${platform || 'linux-amd64'}`, version: values.version.trim(), url: values.url.trim(), sha256: values.sha256.trim().toLowerCase() }))()}>{importing ? '导入中…' : '导入到主控'}</Button>}<Button type="submit" disabled={pending || (source === 'master' && !selectedResource && !builtIn?.available)}>{pending ? '下发中…' : '下发升级任务'}</Button></DialogFooter>
      </form>
    </ResponsiveDialogContent>
  </ResponsiveDialog>;
}
