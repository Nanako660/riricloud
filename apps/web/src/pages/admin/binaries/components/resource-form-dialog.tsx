import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/shared/responsive-dialog';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFormResetOnKey } from '@/hooks/use-form-reset';
import { resolveSupportedTargets, type BinaryKind } from '../use-binaries';

const OS_LABELS: Record<string, string> = { linux: 'Linux', macos: 'macOS', windows: 'Windows' };

function targetLabel(target: string) {
  const [kind, os, arch] = target.split('-');
  return `${kind === 'agent' ? 'Agent' : 'Sing-box'} · ${OS_LABELS[os] ?? os} ${arch.toUpperCase()}`;
}

const baseSchema = z.object({
  kind: z.enum(['AGENT', 'SINGBOX']),
  upstreamVersion: z.string().trim().min(1, '请输入上游版本').max(64, '版本号最多 64 字符'),
  revision: z.coerce
    .number({ invalid_type_error: '修订号必须为数字' })
    .int('修订号必须为整数')
    .min(1, '修订号至少为 1')
    .max(9999, '修订号最大 9999'),
  target: z.string().min(1, '请选择平台'),
  filename: z.string().trim().max(128, '文件名最多 128 字符').optional(),
  sha256: z.string().trim().regex(/^[a-f0-9]{64}$/i, 'SHA-256 需为 64 位十六进制摘要'),
  file: z.instanceof(File, { message: '请选择要上传的文件' }).optional(),
  url: z.string().trim().url('请输入合法的 http(s) 下载地址').optional()
});

type ResourceFormValues = z.infer<typeof baseSchema>;

const EMPTY_VALUES: ResourceFormValues = {
  kind: 'SINGBOX',
  upstreamVersion: '',
  revision: 1,
  target: 'singbox-linux-amd64',
  filename: '',
  url: '',
  sha256: '',
  file: undefined
};

export function ResourceFormDialog({ mode, open, onOpenChange, onSubmit, pending, supportedTargets }: {
  mode: 'upload' | 'import';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: { file?: File; kind: BinaryKind; upstreamVersion: string; revision: number; target: string; filename?: string; url?: string; sha256: string }) => void;
  pending: boolean;
  supportedTargets?: string[];
}) {
  const targets = resolveSupportedTargets(supportedTargets);
  const [hashState, setHashState] = React.useState<'idle' | 'computing' | 'done'>('idle');
  const form = useForm<ResourceFormValues>({
    resolver: zodResolver(
      baseSchema.superRefine((value, ctx) => {
        if (mode === 'upload' && !value.file) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['file'], message: '请选择要上传的文件' });
        }
        if (mode === 'import' && !value.url) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['url'], message: '请输入下载 URL' });
        }
      })
    ),
    defaultValues: EMPTY_VALUES
  });

  useFormResetOnKey({
    open,
    resetKey: mode,
    reset: () => {
      form.reset(EMPTY_VALUES);
      setHashState('idle');
    }
  });

  const kind = form.watch('kind');
  const kindTargets = targets.filter((target) => target.startsWith(`${kind.toLowerCase()}-`));

  const handleKindChange = (nextKind: BinaryKind) => {
    form.setValue('kind', nextKind, { shouldValidate: false });
    const nextTarget = targets.find((target) => target.startsWith(`${nextKind.toLowerCase()}-`));
    if (nextTarget) form.setValue('target', nextTarget, { shouldValidate: false });
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    form.setValue('file', file, { shouldValidate: false });
    if (!file) return;
    setHashState('computing');
    try {
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const hex = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
      form.setValue('sha256', hex, { shouldValidate: true });
      setHashState('done');
    } catch {
      setHashState('idle');
      toast.error('自动计算 SHA-256 失败，请手动粘贴');
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent size="compact">
        <DialogHeader>
          <DialogTitle>{mode === 'upload' ? '上传资源' : '远程导入资源'}</DialogTitle>
          <DialogDescription>资源先以草稿保存，校验文件后再启用。</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit((values) => onSubmit(values))}>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>资源类型</FormLabel>
                    <Select value={field.value} onValueChange={(value) => handleKindChange(value as BinaryKind)}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="AGENT">RiriCloud Agent</SelectItem>
                        <SelectItem value="SINGBOX">Sing-box 内核</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="upstreamVersion"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>上游版本</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={kind === 'SINGBOX' ? '1.14.0' : '0.8.7'} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="target"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>平台</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {kindTargets.map((target) => (
                          <SelectItem key={target} value={target}>{targetLabel(target)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="revision"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>资源修订号</FormLabel>
                    <FormControl>
                      <Input inputMode="numeric" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {mode === 'upload' ? (
              <FormField
                control={form.control}
                name="file"
                render={({ field: { value: _value, ...fieldProps } }) => (
                  <FormItem>
                    <FormLabel>文件</FormLabel>
                    <FormControl>
                      <Input type="file" {...fieldProps} onChange={handleFileChange} />
                    </FormControl>
                    <FormDescription>
                      {hashState === 'computing' ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Loader2 className="size-3 animate-spin" /> 正在计算 SHA-256…
                        </span>
                      ) : hashState === 'done' ? (
                        <span className="text-emerald-600">已自动计算文件 SHA-256</span>
                      ) : (
                        '选择文件后将自动计算 SHA-256'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <FormField
                control={form.control}
                name="url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>下载 URL</FormLabel>
                    <FormControl>
                      <Input type="url" {...field} placeholder="https://downloads.example.com/sing-box" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="sha256"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>SHA-256</FormLabel>
                  <FormControl>
                    <Input className="font-mono text-xs" {...field} placeholder="64 位十六进制摘要" />
                  </FormControl>
                  <FormDescription>{mode === 'upload' ? '上传模式自动填充，可手动覆盖' : '可使用 sha256sum 等工具计算后粘贴'}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="filename"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>文件名（可选）</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder={kind === 'AGENT' ? 'riri-agent' : 'sing-box'} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
              <Button type="submit" disabled={pending || hashState === 'computing'}>
                {pending ? '处理中…' : mode === 'upload' ? '上传资源' : '导入资源'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
