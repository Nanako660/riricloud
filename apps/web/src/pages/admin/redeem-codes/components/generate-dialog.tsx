import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/shared/responsive-dialog';

export interface GenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: { count: number; amount: number; prefix?: string; expiresAt?: string | null; note?: string }) => void;
  pending: boolean;
}

export function GenerateDialog({ open, onOpenChange, onSubmit, pending }: GenerateDialogProps) {
  const { t } = useTranslation(['admin', 'common']);

  const schema = React.useMemo(() => z.object({
    count: z.coerce.number().int().min(1, t('admin:redeemCodes.valCountMin')).max(1000, t('admin:redeemCodes.valCountMax')),
    amountYuan: z.coerce.number().positive(t('admin:redeemCodes.valAmountPositive')).multipleOf(0.01, t('admin:redeemCodes.valAmountDecimals')),
    prefix: z.string().max(16).regex(/^[A-Za-z0-9-]*$/, t('admin:redeemCodes.valPrefixChars')).optional(),
    expiresAt: z.string().optional(),
    note: z.string().max(200).optional()
  }), [t]);

  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { count: 10, amountYuan: 10, prefix: '', expiresAt: '', note: '' }
  });

  const submit = (values: FormValues) => onSubmit({
    count: values.count,
    amount: Math.round(values.amountYuan * 100),
    prefix: values.prefix || undefined,
    expiresAt: values.expiresAt ? new Date(values.expiresAt).toISOString() : null,
    note: values.note || undefined
  });

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <DialogHeader>
          <DialogTitle>{t('admin:redeemCodes.batchGenerate')}</DialogTitle>
          <DialogDescription>{t('admin:redeemCodes.generateDialogDesc')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="count"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('admin:redeemCodes.countLabel')}</FormLabel>
                  <FormControl><Input type="number" min={1} max={1000} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="amountYuan"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('admin:redeemCodes.amountLabel')}</FormLabel>
                  <FormControl><Input type="number" min={0.01} step="0.01" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="prefix"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('admin:redeemCodes.prefixLabel')}</FormLabel>
                  <FormControl><Input placeholder={t('admin:redeemCodes.prefixPlaceholder')} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="expiresAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('admin:redeemCodes.expiresAtLabel')}</FormLabel>
                  <FormControl><Input type="datetime-local" {...field} /></FormControl>
                  <FormDescription>{t('admin:redeemCodes.expiresAtDesc')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>{t('admin:redeemCodes.noteLabel')}</FormLabel>
                  <FormControl><Input placeholder={t('admin:redeemCodes.notePlaceholder')} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('common:actions.cancel')}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? t('admin:redeemCodes.generating') : t('admin:redeemCodes.generate')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
