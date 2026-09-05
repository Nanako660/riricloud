import type { UseFormReturn } from 'react-hook-form';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { Plan } from '../../plans/use-plans';
import type { CreateUserForm, EditAccountForm } from './user-form-schema';

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
                }}
              >
                <FormControl><SelectTrigger><SelectValue placeholder="暂不绑定套餐" /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="none">暂不绑定套餐</SelectItem>
                  {plans.map((plan) => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormDescription>选择套餐后将自动继承套餐配额与时长；亦可暂不绑定，创建无订阅账号。</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}

export function EditAccountFields({ form, isSelf }: { form: UseFormReturn<EditAccountForm>; isSelf: boolean }) {
  return (
    <div className="space-y-4">
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

      <div className="space-y-2.5">
        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-xs">
              <div className="space-y-0.5 pr-2">
                <FormLabel className="text-sm font-medium cursor-pointer">启用账号</FormLabel>
                <p className="text-xs text-muted-foreground">停用后用户将被禁止登录控制台及建立节点代理连接</p>
              </div>
              <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="emailVerified"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-xs">
              <div className="space-y-0.5 pr-2">
                <FormLabel className="text-sm font-medium cursor-pointer">邮箱已验证</FormLabel>
                <p className="text-xs text-muted-foreground">开启强制邮箱验证时，未验证普通用户将被限制获取订阅与连接节点</p>
              </div>
              <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
            </FormItem>
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
