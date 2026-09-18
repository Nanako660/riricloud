import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api, extractErrorMessage } from '@/lib/api';

export interface AdminUser {
  id: string;
  uid: number | null;
  nickname: string;
  email: string;
  emailVerifiedAt: string | null;
  role: 'ADMIN' | 'USER';
  balance: number;
  trafficLimitBytes: number;
  trafficUsedBytes: number;
  expireAt: string | null;
  isActive: boolean;
  createdAt: string;
  subscription: AdminUserSubscription | null;
}

export interface AdminUserSubscription {
  id: string;
  status: 'ACTIVE' | 'CANCELED' | 'EXPIRED' | 'REVOKED';
  trafficLimitBytes: number;
  trafficUsedBytes: number;
  startedAt: string;
  expireAt: string | null;
  trafficResetMode: 'NONE' | 'CALENDAR_MONTH' | 'SUBSCRIPTION_CYCLE';
  nextTrafficResetAt: string | null;
  extraLineIds: string[];
  plan: { id: string; name: string } | null;
}

interface ListUsersParams {
  search?: string;
  pageSize?: number;
  role?: 'ADMIN' | 'USER';
  isActive?: boolean;
  emailVerified?: boolean;
  subscriptionStatus?: AdminUserSubscription['status'] | 'NONE';
  planId?: string;
}

// 用户列表：搜索走服务端 contains(email)，pageSize=100 客户端分页
export function useAdminUsers(params: ListUsersParams) {
  return useQuery({
    queryKey: ['admin', 'users', params],
    queryFn: async () =>
      (
        await api.get<{ data: AdminUser[]; total: number }>('/admin/users', {
          params: {
            pageSize: params.pageSize ?? 100,
            ...(params.search ? { search: params.search } : {}),
            ...(params.role ? { role: params.role } : {}),
            ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
            ...(params.emailVerified !== undefined ? { emailVerified: params.emailVerified } : {}),
            ...(params.subscriptionStatus ? { subscriptionStatus: params.subscriptionStatus } : {}),
            ...(params.planId ? { planId: params.planId } : {})
          }
        })
      ).data,
    refetchInterval: 5000
  });
}

export function useUserMutations() {
  const { t } = useTranslation(['admin', 'common']);
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });

  const invalidateSub = {
    onSuccess: () => {
      toast.success(t('admin:users.savedSuccess'));
      void invalidate();
    },
    onError: (e: unknown) => toast.error(extractErrorMessage(e, t('admin:users.operationFailed')))
  };

  const createUser = useMutation({
    mutationFn: async (payload: {
      email: string;
      password: string;
      role?: string;
      trafficLimitBytes?: number;
      expireAt?: string | null;
      planId?: string | null;
    }) => (await api.post('/admin/users', payload)).data,
    ...invalidateSub
  });

  const updateUser = useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: {
      id: string;
      role?: string;
      trafficLimitBytes?: number;
      expireAt?: string | null;
      isActive?: boolean;
      password?: string;
      emailVerified?: boolean;
    }) => (await api.patch(`/admin/users/${id}`, payload)).data,
    ...invalidateSub
  });

  const updateSubscription = useMutation({
    mutationFn: async ({ id, ...payload }: {
      id: string;
      planId?: string | null;
      status?: AdminUserSubscription['status'];
      trafficLimitBytes?: number;
      trafficUsedBytes?: number;
      expireAt?: string | null;
      addDays?: number;
      extraLineIds?: string[];
    }) => (await api.patch(`/admin/subscriptions/${id}`, payload)).data,
    onSuccess: () => {
      toast.success(t('admin:users.subUpdatedSuccess'));
      void invalidate();
      void queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] });
      void queryClient.invalidateQueries({ queryKey: ['user', 'subscription'] });
    },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, t('admin:users.subUpdateFailed')))
  });

  const assignSubscription = useMutation({
    mutationFn: async ({ userId, ...payload }: {
      userId: string;
      planId: string;
      status?: AdminUserSubscription['status'];
      trafficLimitBytes?: number;
      trafficUsedBytes?: number;
      expireAt?: string | null;
      addDays?: number;
      extraLineIds?: string[];
    }) => (await api.post(`/admin/subscriptions/users/${userId}`, payload)).data,
    onSuccess: () => {
      toast.success(t('admin:users.subBoundSuccess'));
      void invalidate();
      void queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] });
    },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, t('admin:users.subBindFailed')))
  });

  const resetSubscriptionToken = useMutation({
    mutationFn: async (userId: string) =>
      (await api.post<{ subscriptionToken: string }>(`/admin/users/${userId}/reset-subscription-token`)).data,
    onSuccess: () => {
      toast.success(t('admin:users.subTokenResetSuccess'));
      void invalidate();
      void queryClient.invalidateQueries({ queryKey: ['user', 'subscription'] });
    },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, t('admin:users.subTokenResetFailed')))
  });

  const adjustBalance = useMutation({
    mutationFn: async ({ id, amount, description }: { id: string; amount: number; description?: string }) => (await api.post(`/admin/users/${id}/adjust-balance`, { amount, description })).data,
    onSuccess: () => { toast.success(t('admin:users.balanceAdjustedSuccess')); void invalidate(); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, t('admin:users.balanceAdjustFailed')))
  });

  const deleteUser = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/admin/users/${id}`)).data,
    ...invalidateSub
  });

  // 批量封禁/解封：逐个 PATCH，完成后统一提示
  const bulkActive = useMutation({
    mutationFn: async ({ ids, isActive }: { ids: string[]; isActive: boolean }) => {
      const results = await Promise.allSettled(
        ids.map((id) => api.patch(`/admin/users/${id}`, { isActive }))
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      return { total: ids.length, failed };
    },
    onSuccess: ({ total, failed }) => {
      if (failed === 0) {
        toast.success(
          total === 1
            ? t('admin:users.batchOperateSingleSuccess')
            : t('admin:users.batchOperateSuccess', { count: total })
        );
      } else {
        toast.warning(t('admin:users.batchOperatePartial', { success: total - failed, failed }));
      }
      void invalidate();
    }
  });

  return {
    createUser,
    updateUser,
    updateSubscription,
    assignSubscription,
    resetSubscriptionToken,
    adjustBalance,
    deleteUser,
    bulkActive
  };
}
