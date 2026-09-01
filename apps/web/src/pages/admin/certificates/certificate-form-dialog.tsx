import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { FileKey2, FileText, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/shared/responsive-dialog';
import { extractErrorMessage } from '@/lib/api';
import { useCertificateDetail, useCertificateMutations, type CertificatePayload } from './use-certificates';

const certificateFormSchema = z.object({
  name: z.string().trim().min(1, '请输入证书名称').max(128, '证书名称不超过 128 字符'),
  certificatePem: z.string().trim().min(1, '请粘贴或上传证书'),
  privateKeyPem: z.string().optional()
});

type CertificateFormValues = z.infer<typeof certificateFormSchema>;

const statusLabels = {
  VALID: '有效',
  EXPIRING: '即将到期',
  EXPIRED: '已过期',
  NOT_YET_VALID: '尚未生效'
} as const;

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString('zh-CN');
}

export function CertificateFormDialog({
  open,
  onOpenChange,
  certificateId,
  pending,
  onSubmit
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  certificateId: string | null;
  pending: boolean;
  onSubmit: (payload: CertificatePayload) => void;
}) {
  const form = useForm<CertificateFormValues>({
    resolver: zodResolver(certificateFormSchema),
    defaultValues: { name: '', certificatePem: '', privateKeyPem: '' }
  });
  const detail = useCertificateDetail(certificateId, open);
  const { parse } = useCertificateMutations();
  const certificatePem = form.watch('certificatePem');
  const privateKeyPem = form.watch('privateKeyPem');

  React.useEffect(() => {
    if (!open) return;
    if (!certificateId) {
      form.reset({ name: '', certificatePem: '', privateKeyPem: '' });
    } else if (detail.data) {
      form.reset({ name: detail.data.name, certificatePem: detail.data.certificatePem, privateKeyPem: '' });
    }
  }, [certificateId, detail.data, form, open]);

  React.useEffect(() => {
    parse.reset();
    if (!certificatePem.trim()) return undefined;
    const timer = window.setTimeout(() => {
      parse.mutate({
        certificatePem,
        ...(privateKeyPem?.trim() ? { privateKeyPem } : {})
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [certificatePem, parse, privateKeyPem]);

  const readFile = async (field: 'certificatePem' | 'privateKeyPem', event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    form.setValue(field, await file.text(), { shouldDirty: true, shouldValidate: true });
  };

  const submit = (values: CertificateFormValues) => {
    if (!certificateId && !values.privateKeyPem?.trim()) {
      form.setError('privateKeyPem', { message: '新建证书必须提供私钥' });
      return;
    }
    onSubmit({
      name: values.name.trim(),
      certificatePem: values.certificatePem.trim(),
      ...(values.privateKeyPem?.trim() ? { privateKeyPem: values.privateKeyPem.trim() } : {})
    });
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent size="wide">
        <DialogHeader>
          <DialogTitle>{certificateId ? '编辑证书' : '新增证书'}</DialogTitle>
          <DialogDescription>证书通过 X.509 校验后，可在线路表单中选择并内嵌同步到节点。</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>证书名称</FormLabel>
                <FormControl><Input placeholder="例如：api.example.com 生产证书" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="certificatePem" render={({ field }) => (
              <FormItem>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <FormLabel>证书 PEM</FormLabel>
                  <Button type="button" variant="outline" size="sm" asChild>
                    <label><FileText />上传证书<Input className="sr-only" type="file" accept=".pem,.crt,.cer,text/plain" onChange={(event) => void readFile('certificatePem', event)} /></label>
                  </Button>
                </div>
                <FormControl><Textarea className="min-h-44 font-mono text-xs" spellCheck={false} placeholder="-----BEGIN CERTIFICATE-----" {...field} /></FormControl>
                <FormDescription>仅上传叶子证书；系统会读取 SAN、签发者和有效期。</FormDescription>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="privateKeyPem" render={({ field }) => (
              <FormItem>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <FormLabel>私钥 PEM</FormLabel>
                  <Button type="button" variant="outline" size="sm" asChild>
                    <label><FileKey2 />上传私钥<Input className="sr-only" type="file" accept=".pem,.key,text/plain" onChange={(event) => void readFile('privateKeyPem', event)} /></label>
                  </Button>
                </div>
                <FormControl><Textarea className="min-h-36 font-mono text-xs" spellCheck={false} placeholder={certificateId ? '留空保留现有私钥' : '-----BEGIN PRIVATE KEY-----'} {...field} value={field.value ?? ''} /></FormControl>
                <FormDescription>{certificateId ? '编辑时留空保留原私钥；更换证书时请同时提供新的匹配私钥。' : '仅支持未加密 PEM 私钥。'}</FormDescription>
                <FormMessage />
              </FormItem>
            )} />

            {parse.isPending && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />正在解析证书…</div>}
            {parse.isError && <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{extractErrorMessage(parse.error, '证书解析失败')}</p>}
            {parse.data && <div className="space-y-2 rounded-md border bg-muted/20 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">解析结果</span><span className="text-muted-foreground">{statusLabels[parse.data.status]}</span></div>
              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <span>签发者：{parse.data.issuer}</span>
                <span>有效期：{formatDate(parse.data.validFrom)} 至 {formatDate(parse.data.validTo)}</span>
                <span className="sm:col-span-2">SAN：{parse.data.sans.join('、')}</span>
                {parse.data.privateKeyMatched !== null && <span>私钥匹配：{parse.data.privateKeyMatched ? '是' : '否'}</span>}
              </div>
            </div>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
              <Button type="submit" disabled={pending || detail.isPending}>{pending ? '保存中…' : '保存证书'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
