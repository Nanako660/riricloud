import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, extractErrorMessage } from '@/lib/api';

export interface AdminUser {
  id: string;
  email: string;
  role: 'ADMIN' | 'USER';
  trafficLimitBytes: number;
  trafficUsedBytes: number;
  expireAt: string | null;
  isActive: boolean;
  createdAt: string;
}

interface ListUsersParams {
  search?: string;
  pageSize?: number;
}

// 用户列表：搜索走服务端 contains(email)，pageSize=100 客户端分页
export function useAdminUsers(params: ListUsersParams) {
  return useQuery({
    queryKey: ['admin', 'users', params.search ?? ''],
    queryFn: async () =>
      (
        await api.get<{ data: AdminUser[]; total: number }>('/admin/users', {
          params: { pageSize: params.pageSize ?? 100, ...(params.search ? { search: params.search } : {}) }
        })
      ).data
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
      expireAt?: string;
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

  return { createUser, updateUser, deleteUser, bulkActive };
}
