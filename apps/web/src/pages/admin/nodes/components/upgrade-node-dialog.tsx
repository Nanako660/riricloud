import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AdminBinaryInfo, AdminNode } from '../use-nodes';

const schema = z.object({
  target: z.enum(['singbox', 'agent']),
  source: z.enum(['master', 'custom']),
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

export function UpgradeNodeDialog({ open, onOpenChange, pending, importing, node, binaryInfo, onSubmit, onImport }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  importing: boolean;
  node: Pick<AdminNode, 'osArch' | 'agentVersion' | 'kernelVersion'>;
  binaryInfo?: AdminBinaryInfo;
  onSubmit: (values: { target: 'singbox' | 'agent'; version?: string; url?: string; sha256?: string }) => void;
  onImport: (values: { target: string; version: string; url: string; sha256: string }) => void;
}) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { target: 'singbox', source: 'master', version: '', url: '', sha256: '' }
  });
  const target = form.watch('target');
  const source = form.watch('source');
  const platform = normalizeArch(node.osArch);
  const builtIn = binaryInfo?.targets.find((item) => item.kind === target && item.target.endsWith(platform));

  React.useEffect(() => {
    if (open) form.reset({ target: 'singbox', source: 'master', version: '', url: '', sha256: '' });
  }, [open, form]);

  const submit = (values: Values) => onSubmit({
    target: values.target,
    ...(values.version?.trim() ? { version: values.version.trim() } : {}),
    ...(values.source === 'custom' ? { url: values.url?.trim(), sha256: values.sha256?.trim().toLowerCase() } : {})
  });

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent size="compact">
      <DialogHeader>
        <DialogTitle>节点升级中心</DialogTitle>
        <DialogDescription>默认从主控内置分发中心下载并校验，适合无法稳定访问外部站点的节点。</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>升级目标</Label>
            <Controller control={form.control} name="target" render={({ field }) => <Select value={field.value} onValueChange={field.onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="singbox">Sing-box 内核</SelectItem><SelectItem value="agent">RiriCloud Agent</SelectItem></SelectContent></Select>} />
          </div>
          <div className="space-y-2">
            <Label>文件来源</Label>
            <Controller control={form.control} name="source" render={({ field }) => <Select value={field.value} onValueChange={field.onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="master">主控内置版本</SelectItem><SelectItem value="custom">自定义地址</SelectItem></SelectContent></Select>} />
          </div>
        </div>
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2"><span className="text-muted-foreground">当前 {target === 'agent' ? 'Agent' : 'Sing-box'}：</span><span className="font-medium">{target === 'agent' ? node.agentVersion || '未上报' : node.kernelVersion || '未上报'}</span>{source === 'master' && <><span className="text-muted-foreground">主控推荐：</span><Badge variant={builtIn?.available ? 'default' : 'secondary'}>{builtIn?.available ? builtIn.version : '未找到对应架构'}</Badge></>}</div>
          <p className="mt-1 text-xs text-muted-foreground">运行平台：{node.osArch || '等待 Agent 首次上报'}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="upgrade-version">版本号{source === 'master' ? '（留空使用主控版本）' : ''}</Label>
          <Input id="upgrade-version" placeholder={source === 'master' ? (builtIn?.version || '主控内置版本') : '1.11.0'} {...form.register('version')} />
          {form.formState.errors.version && <p className="text-xs text-destructive">{form.formState.errors.version.message}</p>}
        </div>
        {source === 'custom' && <>
          <div className="space-y-2"><Label htmlFor="upgrade-url">下载 URL</Label><Input id="upgrade-url" type="url" placeholder="https://downloads.example.com/sing-box" {...form.register('url')} />{form.formState.errors.url && <p className="text-xs text-destructive">{form.formState.errors.url.message}</p>}</div>
          <div className="space-y-2"><Label htmlFor="upgrade-sha">SHA-256</Label><Input id="upgrade-sha" className="font-mono text-xs" placeholder="64 位十六进制摘要" {...form.register('sha256')} />{form.formState.errors.sha256 && <p className="text-xs text-destructive">{form.formState.errors.sha256.message}</p>}</div>
        </>}
        <DialogFooter className="gap-2 sm:gap-0"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>{source === 'custom' && <Button type="button" variant="secondary" disabled={importing || target !== 'singbox'} onClick={() => void form.handleSubmit((values) => values.version && values.url && values.sha256 && onImport({ target: `singbox-${platform || 'linux-amd64'}`, version: values.version.trim(), url: values.url.trim(), sha256: values.sha256.trim().toLowerCase() }))()}>{importing ? '导入中…' : '导入到主控'}</Button>}<Button type="submit" disabled={pending || (source === 'master' && !builtIn?.available)}>{pending ? '下发中…' : '下发升级任务'}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
