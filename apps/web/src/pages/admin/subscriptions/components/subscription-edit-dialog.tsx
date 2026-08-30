import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AdminSubscription, useSubscriptionMutations } from '../use-subscriptions';
import { Plan } from '../../plans/use-plans';

const schema = z.object({ status: z.enum(['ACTIVE', 'CANCELED', 'EXPIRED', 'REVOKED']), trafficLimitGB: z.coerce.number().positive(), trafficUsedGB: z.coerce.number().min(0), expireAt: z.string().optional(), addDays: z.coerce.number().int().min(1).optional(), planId: z.string().optional() });
type Values = z.infer<typeof schema>;
const GB = 1024 ** 3;

export function SubscriptionEditDialog({ open, onOpenChange, subscription, plans }: { open: boolean; onOpenChange: (open: boolean) => void; subscription: AdminSubscription | null; plans: Plan[] }) {
  const { update } = useSubscriptionMutations();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { status: 'ACTIVE', trafficLimitGB: 100, trafficUsedGB: 0, expireAt: '', addDays: undefined, planId: '' } });
  useEffect(() => { if (open && subscription) form.reset({ status: subscription.status, trafficLimitGB: subscription.trafficLimitBytes / GB, trafficUsedGB: subscription.trafficUsedBytes / GB, expireAt: subscription.expireAt ? subscription.expireAt.slice(0, 10) : '', addDays: undefined, planId: subscription.plan.id }); }, [open, subscription, form]);
  const submit = (values: Values) => update.mutate({ id: subscription!.id, status: values.status, planId: values.planId || undefined, trafficLimitBytes: Math.round(values.trafficLimitGB * GB), trafficUsedBytes: Math.round(values.trafficUsedGB * GB), expireAt: values.expireAt ? new Date(`${values.expireAt}T23:59:59`).toISOString() : null, addDays: values.addDays });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>管理订阅 · {subscription?.user.email}</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={form.handleSubmit(submit)}><div className="space-y-2"><Label>状态</Label><Controller control={form.control} name="status" render={({ field }) => <Select value={field.value} onValueChange={field.onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['ACTIVE', 'CANCELED', 'EXPIRED', 'REVOKED'].map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select>} /></div><div className="space-y-2"><Label>套餐</Label><Controller control={form.control} name="planId" render={({ field }) => <Select value={field.value || 'none'} onValueChange={(value) => field.onChange(value === 'none' ? '' : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">不更换套餐</SelectItem>{plans.map((plan) => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}</SelectContent></Select>} /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="sub-limit">配额（GiB）</Label><Input id="sub-limit" type="number" min="1" step="0.1" {...form.register('trafficLimitGB')} /></div><div className="space-y-2"><Label htmlFor="sub-used">已用（GiB）</Label><Input id="sub-used" type="number" min="0" step="0.1" {...form.register('trafficUsedGB')} /></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="sub-expire">到期日</Label><Input id="sub-expire" type="date" {...form.register('expireAt')} /></div><div className="space-y-2"><Label htmlFor="sub-add-days">增加天数</Label><Input id="sub-add-days" type="number" min="1" placeholder="可选" {...form.register('addDays')} /></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button><Button type="submit" disabled={update.isPending}>{update.isPending ? '保存中…' : '保存变更'}</Button></DialogFooter></form></DialogContent></Dialog>;
}
