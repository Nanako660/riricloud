import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/shared/responsive-dialog';
import { Form } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import type { Plan } from '../../plans/use-plans';
import { useUserMutations, type AdminUser } from '../use-users';
import { CreateUserFields, EditAccountFields } from './user-account-fields';
import { UserSubscriptionFields } from './user-subscription-fields';
import { createUserSchema, dateInputAfterDays, dateInputToIso, editAccountSchema, GB, subscriptionSchema, type CreateUserForm, type EditAccountForm, type SubscriptionForm } from './user-form-schema';

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUser | null;
  selfId: string;
  plans: Plan[];
}

const emptyCreateValues: CreateUserForm = {
  email: '',
  password: '',
  role: 'USER',
  planId: '',
  quotaGB: 100,
  permanent: false,
  expireAt: dateInputAfterDays(30)
};

export function UserFormDialog({ open, onOpenChange, user, selfId, plans }: UserFormDialogProps) {
  const { createUser, updateUser, updateSubscription, assignSubscription, resetSubscriptionToken } = useUserMutations();
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [removeSubscriptionConfirmOpen, setRemoveSubscriptionConfirmOpen] = useState(false);
  const isEdit = !!user;
  const isSelf = user?.id === selfId;
  const accountForm = useForm<EditAccountForm>({ resolver: zodResolver(editAccountSchema), defaultValues: { role: 'USER', isActive: true, password: '' } });
  const createForm = useForm<CreateUserForm>({ resolver: zodResolver(createUserSchema), defaultValues: emptyCreateValues });
  const subscriptionForm = useForm<SubscriptionForm>({ resolver: zodResolver(subscriptionSchema), defaultValues: { planId: '', status: 'ACTIVE', quotaGB: 100, usedGB: 0, expireAt: '', addDays: undefined } });

  useEffect(() => {
    if (!open) return;
    if (!user) {
      createForm.reset(emptyCreateValues);
      return;
    }
    accountForm.reset({ role: user.role, isActive: user.isActive, password: '' });
    const subscription = user.subscription;
    subscriptionForm.reset({
      planId: subscription?.plan?.id ?? '',
      status: subscription?.status ?? 'ACTIVE',
      quotaGB: (subscription?.trafficLimitBytes ?? 100 * GB) / GB,
      usedGB: (subscription?.trafficUsedBytes ?? 0) / GB,
      expireAt: subscription?.expireAt ? subscription.expireAt.slice(0, 10) : '',
      addDays: undefined
    });
  }, [accountForm, createForm, open, subscriptionForm, user]);

  const submitAccount = (values: EditAccountForm) => {
    if (!user) return;
    updateUser.mutate({ id: user.id, role: values.role, isActive: values.isActive, ...(values.password ? { password: values.password } : {}) }, { onSuccess: () => onOpenChange(false) });
  };

  const submitCreate = (values: CreateUserForm) => {
    createUser.mutate({
      email: values.email,
      password: values.password,
      role: values.role,
      planId: values.planId || null,
      trafficLimitBytes: Math.round(values.quotaGB * GB),
      expireAt: values.permanent ? null : dateInputToIso(values.expireAt ?? '')
    }, { onSuccess: () => onOpenChange(false) });
  };

  const submitSubscription = (values: SubscriptionForm) => {
    if (!user) return;
    const planId = values.planId || null;
    if (!planId && !user.subscription) {
      onOpenChange(false);
      return;
    }
    if (!planId && user.subscription) {
      setRemoveSubscriptionConfirmOpen(true);
      return;
    }
    const payload = {
      planId,
      status: values.status,
      trafficLimitBytes: Math.round(values.quotaGB * GB),
      trafficUsedBytes: Math.round(values.usedGB * GB),
      expireAt: values.addDays ? undefined : dateInputToIso(values.expireAt ?? ''),
      addDays: values.addDays
    };
    if (user.subscription) {
      updateSubscription.mutate({ id: user.subscription.id, ...payload }, { onSuccess: () => onOpenChange(false) });
    } else if (planId) {
      assignSubscription.mutate({ userId: user.id, ...payload, planId }, { onSuccess: () => onOpenChange(false) });
    }
  };

  return (
    <>
      <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
        <ResponsiveDialogContent>
          <DialogHeader>
            <DialogTitle>{isEdit ? `管理用户 · ${user?.email}` : '创建用户'}</DialogTitle>
            <DialogDescription>{isEdit ? '账号安全与订阅管理统一维护' : '创建用户可选择初始套餐或暂不绑定，配额和有效期可继续微调。'}</DialogDescription>
          </DialogHeader>
          {isEdit ? (
            <Tabs key={user?.id} defaultValue="account" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="account">账号安全</TabsTrigger>
                <TabsTrigger value="subscription">订阅管理</TabsTrigger>
              </TabsList>
              <TabsContent value="account">
                <Form {...accountForm}>
                  <form className="space-y-4" onSubmit={accountForm.handleSubmit(submitAccount)}>
                    <EditAccountFields form={accountForm} isSelf={isSelf} />
                    <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button><Button type="submit" disabled={updateUser.isPending}>{updateUser.isPending ? '保存中…' : '保存账号'}</Button></DialogFooter>
                  </form>
                </Form>
              </TabsContent>
              <TabsContent value="subscription">
                <Form {...subscriptionForm}>
                  <form className="space-y-4" onSubmit={subscriptionForm.handleSubmit(submitSubscription)}>
                    <UserSubscriptionFields form={subscriptionForm} plans={plans} subscription={user.subscription} onResetToken={() => setResetConfirmOpen(true)} resetPending={resetSubscriptionToken.isPending} />
                    <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button><Button type="submit" disabled={updateSubscription.isPending || assignSubscription.isPending}>{updateSubscription.isPending || assignSubscription.isPending ? '保存中…' : '保存订阅'}</Button></DialogFooter>
                  </form>
                </Form>
              </TabsContent>
            </Tabs>
          ) : (
            <Form {...createForm}>
              <form className="space-y-4" onSubmit={createForm.handleSubmit(submitCreate)}>
                <CreateUserFields form={createForm} plans={plans} />
                <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button><Button type="submit" disabled={createUser.isPending}>{createUser.isPending ? '创建中…' : '创建用户'}</Button></DialogFooter>
              </form>
            </Form>
          )}
        </ResponsiveDialogContent>
      </ResponsiveDialog>
      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>重置订阅链接？</AlertDialogTitle><AlertDialogDescription>旧链接会立即失效，用户需要重新导入订阅。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (user) resetSubscriptionToken.mutate(user.id); setResetConfirmOpen(false); }}>确认重置</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={removeSubscriptionConfirmOpen} onOpenChange={setRemoveSubscriptionConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>移除用户订阅？</AlertDialogTitle>
            <AlertDialogDescription>该操作会彻底取消当前订阅、移除套餐关联，并使旧订阅链接立即失效。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={updateSubscription.isPending}
              onClick={() => {
                if (user?.subscription) {
                  updateSubscription.mutate(
                    { id: user.subscription.id, planId: null },
                    { onSuccess: () => onOpenChange(false) }
                  );
                }
                setRemoveSubscriptionConfirmOpen(false);
              }}
            >
              确认移除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
