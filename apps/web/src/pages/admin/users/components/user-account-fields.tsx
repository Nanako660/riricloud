import type { UseFormReturn } from 'react-hook-form';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { Plan } from '../../plans/use-plans';
import { dateInputAfterDays, GB, type CreateUserForm, type EditAccountForm } from './user-form-schema';

export function CreateUserFields({ form, plans }: { form: UseFormReturn<CreateUserForm>; plans: Plan[] }) {
  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel>邮箱</FormLabel>
            <FormControl><Input type="email" placeholder="user@example.com" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="password"
        render={({ field }) => (
          <FormItem>
            <FormLabel>初始密码</FormLabel>
            <FormControl><Input type="password" placeholder="至少 8 位" autoComplete="new-password" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>角色</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="USER">用户</SelectItem>
                  <SelectItem value="ADMIN">管理员</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="planId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>初始套餐（可选）</FormLabel>
              <Select
                value={field.value || 'none'}
                onValueChange={(value) => {
                  const planId = value === 'none' ? '' : value;
                  field.onChange(planId);
                  const plan = plans.find((item) => item.id === planId);
                  if (plan) {
                    form.setValue('quotaGB', plan.trafficLimitBytes / GB, { shouldValidate: true });
                    form.setValue('permanent', false, { shouldValidate: true });
                    form.setValue('expireAt', dateInputAfterDays(plan.durationDays), { shouldValidate: true });
                  }
                }}
              >
                <FormControl><SelectTrigger><SelectValue placeholder="暂不绑定套餐" /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="none">暂不绑定套餐</SelectItem>
                  {plans.map((plan) => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormDescription>可先创建无套餐账号，之后在“订阅管理”中绑定套餐。</FormDescription>
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
              <FormLabel>流量配额（GiB）</FormLabel>
              <FormControl><Input type="number" min={1} step="any" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="permanent"
          render={({ field }) => (
            <div className="space-y-2">
              <Label className="invisible" aria-hidden="true">占位</Label>
              <FormItem className="flex h-9 flex-row items-center justify-between space-y-0 rounded-md border px-3 py-2 shadow-sm">
                <FormLabel>永久有效</FormLabel>
                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
              </FormItem>
            </div>
          )}
        />
      </div>
      {!form.watch('permanent') ? (
        <FormField
          control={form.control}
          name="expireAt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>到期日期</FormLabel>
              <FormControl><Input type="date" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : null}
    </div>
  );
}

export function EditAccountFields({ form, isSelf }: { form: UseFormReturn<EditAccountForm>; isSelf: boolean }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>角色</FormLabel>
              <Select disabled={isSelf} value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="USER">用户</SelectItem>
                  <SelectItem value="ADMIN">管理员</SelectItem>
                </SelectContent>
              </Select>
              {isSelf ? <FormDescription>不能修改自己的角色</FormDescription> : null}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <div className="space-y-2">
              <Label className="invisible" aria-hidden="true">占位</Label>
              <FormItem className="flex h-9 flex-row items-center justify-between space-y-0 rounded-md border px-3 py-2 shadow-sm">
                <FormLabel>启用账号</FormLabel>
                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
              </FormItem>
            </div>
          )}
        />
      </div>
      <FormField
        control={form.control}
        name="password"
        render={({ field }) => (
          <FormItem>
            <FormLabel>重置登录密码（可选）</FormLabel>
            <FormControl><Input type="password" placeholder="留空表示不修改" autoComplete="new-password" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
