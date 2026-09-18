import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
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

interface ResourceFormValues {
  kind: 'AGENT' | 'SINGBOX';
  upstreamVersion: string;
  revision: number;
  target: string;
  filename?: string;
  sha256: string;
  file?: File;
  url?: string;
}

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
  const { t } = useTranslation(['admin', 'common']);
  const targets = resolveSupportedTargets(supportedTargets);
  const [hashState, setHashState] = React.useState<'idle' | 'computing' | 'done'>('idle');

  const baseSchema = React.useMemo(() => z.object({
    kind: z.enum(['AGENT', 'SINGBOX']),
    upstreamVersion: z.string().trim().min(1, t('admin:binaries.valUpstreamRequired')).max(64, t('admin:binaries.valUpstreamMax')),
    revision: z.coerce
      .number({ invalid_type_error: t('admin:binaries.valRevisionNumber') })
      .int(t('admin:binaries.valRevisionInt'))
      .min(1, t('admin:binaries.valRevisionMin'))
      .max(9999, t('admin:binaries.valRevisionMax')),
    target: z.string().min(1, t('admin:binaries.valTargetRequired')),
    filename: z.string().trim().max(128, t('admin:binaries.valFilenameMax')).optional(),
    sha256: z.string().trim().regex(/^[a-f0-9]{64}$/i, t('admin:binaries.valSha256Invalid')),
    file: z.instanceof(File, { message: t('admin:binaries.valFileRequired') }).optional(),
    url: z.string().trim().url(t('admin:binaries.valUrlInvalid')).optional()
  }), [t]);

  const form = useForm<ResourceFormValues>({
    resolver: zodResolver(
      baseSchema.superRefine((value, ctx) => {
        if (mode === 'upload' && !value.file) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['file'], message: t('admin:binaries.valFileRequired') });
        }
        if (mode === 'import' && !value.url) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['url'], message: t('admin:binaries.valUrlRequired') });
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
      toast.error(t('admin:binaries.autoHashFailed'));
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent size="compact">
        <DialogHeader>
          <DialogTitle>{mode === 'upload' ? t('admin:binaries.formUploadTitle') : t('admin:binaries.formImportTitle')}</DialogTitle>
          <DialogDescription>{t('admin:binaries.formDesc')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit((values) => onSubmit(values))}>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin:binaries.kindLabel')}</FormLabel>
                    <Select value={field.value} onValueChange={(value) => handleKindChange(value as BinaryKind)}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="AGENT">{t('admin:binaries.kindAgent')}</SelectItem>
                        <SelectItem value="SINGBOX">{t('admin:binaries.kindSingbox')}</SelectItem>
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
                    <FormLabel>{t('admin:binaries.upstreamVersionLabel')}</FormLabel>
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
                    <FormLabel>{t('admin:binaries.targetLabel')}</FormLabel>
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
                    <FormLabel>{t('admin:binaries.revisionLabel')}</FormLabel>
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
                    <FormLabel>{t('admin:binaries.fileLabel')}</FormLabel>
                    <FormControl>
                      <Input type="file" {...fieldProps} onChange={handleFileChange} />
                    </FormControl>
                    <FormDescription>
                      {hashState === 'computing' ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Loader2 className="size-3 animate-spin" /> {t('admin:binaries.computingHash')}
                        </span>
                      ) : hashState === 'done' ? (
                        <span className="text-emerald-600">{t('admin:binaries.computedHash')}</span>
                      ) : (
                        t('admin:binaries.fileSelectDesc')
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
                    <FormLabel>{t('admin:binaries.urlLabel')}</FormLabel>
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
                  <FormLabel>{t('admin:binaries.sha256Label')}</FormLabel>
                  <FormControl>
                    <Input className="font-mono text-xs" {...field} placeholder={t('admin:binaries.sha256Placeholder')} />
                  </FormControl>
                  <FormDescription>{mode === 'upload' ? t('admin:binaries.sha256DescUpload') : t('admin:binaries.sha256DescImport')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="filename"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('admin:binaries.filenameLabel')}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder={kind === 'AGENT' ? 'riri-agent' : 'sing-box'} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common:actions.cancel')}</Button>
              <Button type="submit" disabled={pending || hashState === 'computing'}>
                {pending ? t('admin:binaries.processing') : mode === 'upload' ? t('admin:binaries.formUploadTitle') : t('admin:binaries.formImportTitle')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
