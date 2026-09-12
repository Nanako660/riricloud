import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/shared/responsive-dialog';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { useFormResetOnKey } from '@/hooks/use-form-reset';
import { validateCompatibilityText } from '../binary-labels';
import type { BinaryResource } from '../use-binaries';

const editSchema = z.object({
  notes: z.string().max(2000, '备注最多 2000 字符'),
  compatibilityText: z.string().superRefine((text, ctx) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const result = validateCompatibilityText(trimmed);
    if (!result.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.message });
  })
});

type ResourceEditValues = z.infer<typeof editSchema>;

export function ResourceEditDialog({ resource, open, onOpenChange, onSubmit, pending }: {
  resource: BinaryResource | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: { notes: string | null; compatibility?: Record<string, unknown> }) => void;
  pending: boolean;
}) {
  const form = useForm<ResourceEditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { notes: '', compatibilityText: '' }
  });

  useFormResetOnKey({
    open,
    resetKey: resource?.id ?? 'create',
    reset: () => {
      let compatibilityText = '';
      if (resource?.compatibilityJson) {
        try {
          const parsed = JSON.parse(resource.compatibilityJson) as Record<string, unknown>;
          if (parsed && typeof parsed === 'object' && Object.keys(parsed).length) {
            compatibilityText = JSON.stringify(parsed, null, 2);
          }
        } catch {
          compatibilityText = '';
        }
      }
      form.reset({ notes: resource?.notes ?? '', compatibilityText });
    }
  });

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent size="compact">
        <DialogHeader>
          <DialogTitle>编辑资源信息{resource ? ` · ${resource.version}` : ''}</DialogTitle>
          <DialogDescription>修改备注与兼容性约束；版本与修订号为资源身份标识，不可修改。</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) => {
              const trimmed = values.compatibilityText.trim();
              const compatibility = trimmed ? validateCompatibilityText(trimmed) : null;
              onSubmit({
                notes: values.notes.trim() || null,
                compatibility: compatibility && compatibility.ok ? compatibility.value : undefined
              });
            })}
          >
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>备注</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} placeholder="例如：定制构建，启用 v2ray api" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="compatibilityText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>兼容性约束（JSON）</FormLabel>
                  <FormControl>
                    <Textarea rows={5} className="font-mono text-xs" {...field} placeholder='{"minAgentProtocolVersion": 2}' />
                  </FormControl>
                  <FormDescription>
                    留空表示不修改。支持 minAgentProtocolVersion / maxAgentProtocolVersion（数字）与 minAgentVersion / maxAgentVersion / cronetVersion（字符串）。节点升级时会按此校验。
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
              <Button type="submit" disabled={pending}>{pending ? '保存中…' : '保存修改'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
