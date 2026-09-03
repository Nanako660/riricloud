import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useProfileMutations } from '@/pages/user/profile/use-profile';

const schema = z.object({ code: z.string().trim().min(6, '请输入有效卡密').max(128) });
type Values = z.infer<typeof schema>;

export function QuickRedeemForm() {
  const { redeem } = useProfileMutations();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { code: '' } });
  return <Form {...form}><form className="mt-3 space-y-2" onSubmit={form.handleSubmit((values) => redeem.mutate(values.code, { onSuccess: () => form.reset() }))}><FormField control={form.control} name="code" render={({ field }) => <FormItem><FormLabel className="text-xs">余额不足？输入卡密充值</FormLabel><div className="flex gap-2"><FormControl><Input placeholder="充值卡密" autoComplete="off" {...field} /></FormControl><Button type="submit" variant="outline" disabled={redeem.isPending}>{redeem.isPending ? '兑换中…' : '充值'}</Button></div><FormMessage /></FormItem>} /><p className="text-xs text-muted-foreground">也可以前往 <Link className="text-primary underline underline-offset-4" to="/profile">个人中心</Link> 查看完整账本。</p></form></Form>;
}
