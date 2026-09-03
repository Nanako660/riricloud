import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/shared/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useUserMutations, type AdminUser } from '../use-users';
import { formatCurrency } from '@/lib/utils';

const schema = z.object({ amountYuan: z.coerce.number(), description: z.string().max(200).optional() });
type Values = z.infer<typeof schema>;

export function BalanceFormDialog({ user, open, onOpenChange }: { user: AdminUser | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { adjustBalance } = useUserMutations();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { amountYuan: 0, description: '' } });
  const submit = (values: Values) => {
    if (values.amountYuan === 0 || !Number.isInteger(values.amountYuan * 100)) {
      form.setError('amountYuan', { message: '请输入非零金额，最多保留两位小数' });
      return;
    }
    adjustBalance.mutate({ id: user!.id, amount: Math.round(values.amountYuan * 100), description: values.description || undefined }, { onSuccess: () => { form.reset(); onOpenChange(false); } });
  };
  return <ResponsiveDialog open={open} onOpenChange={onOpenChange}><ResponsiveDialogContent size="compact"><DialogHeader><DialogTitle>调整账户余额</DialogTitle><DialogDescription>{user?.email} 当前余额：{formatCurrency(user?.balance)}</DialogDescription></DialogHeader><Form {...form}><form onSubmit={form.handleSubmit(submit)} className="space-y-4"><FormField control={form.control} name="amountYuan" render={({ field }) => <FormItem><FormLabel>调整金额（元）</FormLabel><FormControl><Input type="number" step="0.01" placeholder="正数增加，负数扣减" {...field} /></FormControl><FormDescription>余额不能被调至负数，操作会写入管理员调账流水。</FormDescription><FormMessage /></FormItem>} /><FormField control={form.control} name="description" render={({ field }) => <FormItem><FormLabel>备注</FormLabel><FormControl><Input placeholder="例如：活动补发" {...field} /></FormControl><FormMessage /></FormItem>} /><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button><Button type="submit" disabled={adjustBalance.isPending}>{adjustBalance.isPending ? '保存中…' : '确认调账'}</Button></DialogFooter></form></Form></ResponsiveDialogContent></ResponsiveDialog>;
}
