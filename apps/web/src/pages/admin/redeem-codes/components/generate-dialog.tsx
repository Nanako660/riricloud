import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/shared/responsive-dialog';

const schema = z.object({
  count: z.coerce.number().int().min(1, '至少生成 1 张').max(1000, '最多生成 1000 张'),
  amountYuan: z.coerce.number().positive('面额必须大于 0').multipleOf(0.01, '最多保留两位小数'),
  prefix: z.string().max(16).regex(/^[A-Za-z0-9-]*$/, '仅允许字母、数字和短横线').optional(),
  expiresAt: z.string().optional(),
  note: z.string().max(200).optional()
});
type FormValues = z.infer<typeof schema>;

export interface GenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: { count: number; amount: number; prefix?: string; expiresAt?: string | null; note?: string }) => void;
  pending: boolean;
}

export function GenerateDialog({ open, onOpenChange, onSubmit, pending }: GenerateDialogProps) {
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { count: 10, amountYuan: 10, prefix: '', expiresAt: '', note: '' } });
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
          <DialogTitle>批量生成充值卡密</DialogTitle>
          <DialogDescription>生成结果仅在弹窗中集中展示一次，请及时复制保存；之后可在列表中查看（默认掩码显示）。</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2">
            <FormField control={form.control} name="count" render={({ field }) => <FormItem><FormLabel>生成数量</FormLabel><FormControl><Input type="number" min={1} max={1000} {...field} /></FormControl><FormMessage /></FormItem>} />
            <FormField control={form.control} name="amountYuan" render={({ field }) => <FormItem><FormLabel>单张面额（元）</FormLabel><FormControl><Input type="number" min={0.01} step="0.01" {...field} /></FormControl><FormMessage /></FormItem>} />
            <FormField control={form.control} name="prefix" render={({ field }) => <FormItem><FormLabel>前缀</FormLabel><FormControl><Input placeholder="例如 RIRI" {...field} /></FormControl><FormMessage /></FormItem>} />
            <FormField control={form.control} name="expiresAt" render={({ field }) => <FormItem><FormLabel>有效期</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl><FormDescription>留空表示永久有效。</FormDescription><FormMessage /></FormItem>} />
            <FormField control={form.control} name="note" render={({ field }) => <FormItem className="sm:col-span-2"><FormLabel>备注</FormLabel><FormControl><Input placeholder="活动充值卡" {...field} /></FormControl><FormMessage /></FormItem>} />
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
              <Button type="submit" disabled={pending}>{pending ? '生成中…' : '生成卡密'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
