import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, extractErrorMessage } from '@/lib/api';

export interface AdminUser {
  id: string;
  email: string;
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
  plan: { id: string; name: string } | null;
}

interface ListUsersParams {
  search?: string;
  pageSize?: number;
  role?: 'ADMIN' | 'USER';
  isActive?: boolean;
  subscriptionStatus?: AdminUserSubscription['status'];
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
            ...(params.subscriptionStatus ? { subscriptionStatus: params.subscriptionStatus } : {}),
            ...(params.planId ? { planId: params.planId } : {})
          }
        })
      ).data,
    refetchInterval: 5000
  });
}

export function useUserMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });

  const invalidateSub = {
    onSuccess: () => {
      toast.success('已保存');
      void invalidate();
    },
    onError: (e: unknown) => toast.error(extractErrorMessage(e, '操作失败'))
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
    }) => (await api.patch(`/admin/subscriptions/${id}`, payload)).data,
    onSuccess: () => {
      toast.success('订阅已更新');
      void invalidate();
      void queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] });
      void queryClient.invalidateQueries({ queryKey: ['user', 'subscription'] });
      void queryClient.invalidateQueries({ queryKey: ['user', 'dashboard'] });
    },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '订阅更新失败'))
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
    }) => (await api.post(`/admin/subscriptions/users/${userId}`, payload)).data,
    onSuccess: () => {
      toast.success('已绑定订阅');
      void invalidate();
      void queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] });
    },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '绑定订阅失败'))
  });

  const resetSubscriptionToken = useMutation({
    mutationFn: async (userId: string) =>
      (await api.post<{ subscriptionToken: string }>(`/admin/users/${userId}/reset-subscription-token`)).data,
    onSuccess: () => {
      toast.success('订阅链接已重置');
      void invalidate();
      void queryClient.invalidateQueries({ queryKey: ['user', 'subscription'] });
      void queryClient.invalidateQueries({ queryKey: ['user', 'dashboard'] });
    },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '重置订阅链接失败'))
  });

  const adjustBalance = useMutation({
    mutationFn: async ({ id, amount, description }: { id: string; amount: number; description?: string }) => (await api.post(`/admin/users/${id}/adjust-balance`, { amount, description })).data,
    onSuccess: () => { toast.success('余额已调整'); void invalidate(); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '余额调整失败'))
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
        toast.success(`已${total === 1 ? '操作' : '批量操作'} ${total} 个用户`);
      } else {
        toast.warning(`操作完成：${total - failed} 成功，${failed} 失败`);
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
