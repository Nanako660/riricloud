import { RefreshCw } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AdminLine } from '../../lines/use-lines';
import type { Plan } from '../../plans/use-plans';
import type { AdminUserSubscription } from '../use-users';
import { dateInputAfterDays, GB, type SubscriptionForm } from './user-form-schema';

const STATUS_LABELS = {
  ACTIVE: '正常',
  CANCELED: '已取消',
  EXPIRED: '已过期',
  REVOKED: '已吊销'
} as const;

const RESET_MODE_LABELS = {
  NONE: '不自动重置',
  CALENDAR_MONTH: '自然月重置',
  SUBSCRIPTION_CYCLE: '订阅周期重置'
} as const;

export function UserSubscriptionFields({
  form,
  plans,
  lineOptions,
  subscription,
  onResetToken,
  resetPending
}: {
  form: UseFormReturn<SubscriptionForm>;
  plans: Plan[];
  lineOptions: AdminLine[];
  subscription: AdminUserSubscription | null;
  onResetToken: () => void;
  resetPending: boolean;
}) {
  const selectedPlan = plans.find((plan) => plan.id === form.watch('planId'));
  const resetMode = subscription?.trafficResetMode ?? selectedPlan?.trafficResetMode ?? 'NONE';
  const nextResetAt = subscription?.nextTrafficResetAt;

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
      <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">流量重置：</span>{RESET_MODE_LABELS[resetMode]}
        {resetMode === 'NONE' ? '，当前套餐不会自动重置' : nextResetAt ? `，下次重置：${new Date(nextResetAt).toLocaleString('zh-CN')}` : '，绑定后按当前周期计算下次重置时间'}
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
              <FormControl><Input type="number" min={0.1} step="any" {...field} /></FormControl>
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
              <FormControl><Input type="number" min={0} step="any" {...field} /></FormControl>
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
      <FormField
        control={form.control}
        name="extraLineIds"
        render={({ field }) => {
          const selectedIds = field.value ?? [];
          const toggleLine = (lineId: string) => {
            field.onChange(
              selectedIds.includes(lineId)
                ? selectedIds.filter((id) => id !== lineId)
                : [...selectedIds, lineId]
            );
          };
          return (
            <FormItem>
              <FormLabel>额外线路授权</FormLabel>
              <FormDescription>授权长期保留；线路需启用且相关节点在线后才会生效。</FormDescription>
              <FormControl>
                <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-3">
                  {lineOptions.length ? lineOptions.map((line) => {
                    const targetLandingNode = line.relayMode === 'TARGET_LINE' ? line.targetLine?.entryNode : line.landingNode;
                    const available = line.status === 'ACTIVE' && line.entryNode.status === 'ONLINE' && (!targetLandingNode || targetLandingNode.status === 'ONLINE');
                    const topologyText = line.type === 'DIRECT'
                      ? `${line.entryNode.name} · ${line.protocolType}`
                      : `${line.entryNode.name} ➔ ${targetLandingNode?.name ?? '未绑定'} · ${line.protocolType}`;
                    return (
                      <div key={line.id} className="flex items-start gap-2">
                        <Checkbox
                          id={`user-extra-line-${line.id}`}
                          checked={selectedIds.includes(line.id)}
                          onCheckedChange={() => toggleLine(line.id)}
                        />
                        <Label htmlFor={`user-extra-line-${line.id}`} className="min-w-0 cursor-pointer text-sm font-normal">
                          <span className="block truncate font-medium">{line.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {topologyText} · {available ? '当前可用' : '等待线路或节点恢复'}
                            {!line.isPublic ? ' · 隐藏线路' : ''}
                          </span>
                        </Label>
                      </div>
                    );
                  }) : <p className="text-xs text-muted-foreground">暂无线路，请先在线路管理中创建。</p>}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          );
        }}
      />
    </div>
  );
}
