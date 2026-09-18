import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { passwordComplexityFromSettings, passwordComplexityHint } from '@/lib/password-policy';
import { usePublicSettings } from '@/lib/public-settings';
import type { Plan } from '../../plans/use-plans';
import type { CreateUserForm, EditAccountForm } from './user-form-schema';

function usePasswordHint(): string {
  const publicSettings = usePublicSettings();
  return passwordComplexityHint(passwordComplexityFromSettings(publicSettings.data));
}

export function CreateUserFields({ form, plans }: { form: UseFormReturn<CreateUserForm>; plans: Plan[] }) {
  const { t } = useTranslation(['admin', 'common']);
  const publicSettings = usePublicSettings();
  const passwordMinLength = publicSettings.data?.passwordMinLength ?? 8;
  const passwordHint = usePasswordHint();
  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('admin:userForm.emailLabel')}</FormLabel>
            <FormControl><Input type="email" placeholder={t('admin:userForm.emailPlaceholder')} {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="password"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('admin:userForm.initialPasswordLabel')}</FormLabel>
            <FormControl><Input type="password" placeholder={t('admin:userForm.initialPasswordPlaceholder', { length: passwordMinLength, hint: passwordHint ? `，${passwordHint}` : '' })} autoComplete="new-password" {...field} /></FormControl>
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
              <FormLabel>{t('admin:userForm.roleLabel')}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="USER">{t('admin:userForm.roleUser')}</SelectItem>
                  <SelectItem value="ADMIN">{t('admin:userForm.roleAdmin')}</SelectItem>
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
              <FormLabel>{t('admin:userForm.initialPlanLabel')}</FormLabel>
              <Select
                value={field.value || 'none'}
                onValueChange={(value) => {
                  const planId = value === 'none' ? '' : value;
                  field.onChange(planId);
                }}
              >
                <FormControl><SelectTrigger><SelectValue placeholder={t('admin:userForm.noPlanOption')} /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="none">{t('admin:userForm.noPlanOption')}</SelectItem>
                  {plans.map((plan) => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormDescription>{t('admin:userForm.planNote')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}

export function EditAccountFields({ form, isSelf }: { form: UseFormReturn<EditAccountForm>; isSelf: boolean }) {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="role"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('admin:userForm.roleLabel')}</FormLabel>
            <Select disabled={isSelf} value={field.value} onValueChange={field.onChange}>
              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
              <SelectContent>
                <SelectItem value="USER">{t('admin:userForm.roleUser')}</SelectItem>
                <SelectItem value="ADMIN">{t('admin:userForm.roleAdmin')}</SelectItem>
              </SelectContent>
            </Select>
            {isSelf ? <FormDescription>{t('admin:userForm.cannotChangeSelfRole')}</FormDescription> : null}
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
                <FormLabel className="text-sm font-medium cursor-pointer">{t('admin:userForm.enableAccount')}</FormLabel>
                <p className="text-xs text-muted-foreground">{t('admin:userForm.enableAccountDesc')}</p>
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
                <FormLabel className="text-sm font-medium cursor-pointer">{t('admin:userForm.emailVerified')}</FormLabel>
                <p className="text-xs text-muted-foreground">{t('admin:userForm.emailVerifiedDesc')}</p>
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
            <FormLabel>{t('admin:userForm.resetPasswordLabel')}</FormLabel>
            <FormControl><Input type="password" placeholder={t('admin:userForm.resetPasswordPlaceholder')} autoComplete="new-password" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
