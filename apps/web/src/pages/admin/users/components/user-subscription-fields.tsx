import { RefreshCw } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Plan } from '../../plans/use-plans';
import type { AdminUserSubscription } from '../use-users';
import { dateInputAfterDays, GB, type SubscriptionForm } from './user-form-schema';

const STATUS_LABELS = {
  ACTIVE: '正常',
  CANCELED: '已取消',
  EXPIRED: '已过期',
  REVOKED: '已吊销'
} as const;

export function UserSubscriptionFields({
  form,
  plans,
  subscription,
  onResetToken,
  resetPending
}: {
  form: UseFormReturn<SubscriptionForm>;
  plans: Plan[];
  subscription: AdminUserSubscription | null;
  onResetToken: () => void;
  resetPending: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <p className="text-sm font-medium">{subscription ? `当前套餐：${subscription.plan?.name ?? '未命名套餐'}` : '当前没有订阅'}</p>
          <p className="text-xs text-muted-foreground">
            {subscription ? `开始于 ${new Date(subscription.startedAt).toLocaleDateString('zh-CN')}` : '当前为无套餐状态，选择套餐后可绑定'}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={resetPending} onClick={onResetToken}>
          <RefreshCw className={resetPending ? 'animate-spin' : undefined} />
          重置订阅链接
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="planId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>套餐</FormLabel>
              <Select
                value={field.value || 'none'}
                onValueChange={(value) => {
                  const planId = value === 'none' ? '' : value;
                  field.onChange(planId);
                  const plan = plans.find((item) => item.id === planId);
                  if (plan) {
                    form.setValue('quotaGB', plan.trafficLimitBytes / GB, { shouldValidate: true });
                    form.setValue('usedGB', 0, { shouldValidate: true });
                    form.setValue('expireAt', dateInputAfterDays(plan.durationDays), { shouldValidate: true });
                    form.setValue('status', 'ACTIVE', { shouldValidate: true });
                  }
                }}
              >
                <FormControl><SelectTrigger><SelectValue placeholder="无套餐" /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="none">无套餐（彻底取消订阅）</SelectItem>
                  {plans.map((plan) => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>订阅状态</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>{Object.entries(STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="quotaGB"
          render={({ field }) => (
            <FormItem>
              <FormLabel>配额（GiB）</FormLabel>
              <FormControl><Input type="number" min={0.1} step="0.1" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="usedGB"
          render={({ field }) => (
            <FormItem>
              <FormLabel>已用流量（GiB）</FormLabel>
              <FormControl><Input type="number" min={0} step="0.1" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="expireAt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>到期日期</FormLabel>
              <FormControl><Input type="date" {...field} /></FormControl>
              <FormDescription>留空表示永久有效。</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="addDays"
          render={({ field }) => (
            <FormItem>
              <FormLabel>增加天数</FormLabel>
              <FormControl><Input type="number" min={1} placeholder="可选" {...field} /></FormControl>
              <FormDescription>在当前到期日上顺延。</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
