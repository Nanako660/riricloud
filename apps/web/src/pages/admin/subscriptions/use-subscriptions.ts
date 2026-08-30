import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, extractErrorMessage } from '@/lib/api';

export interface AdminSubscription {
  id: string;
  userId: string;
  status: 'ACTIVE' | 'CANCELED' | 'EXPIRED' | 'REVOKED';
  trafficLimitBytes: number;
  trafficUsedBytes: number;
  startedAt: string;
  expireAt: string | null;
  user: { id: string; email: string; isActive: boolean };
  plan: { id: string; name: string; price: number };
}

export function useAdminSubscriptions() {
  return useQuery({
    queryKey: ['admin', 'subscriptions'],
    queryFn: async () => (await api.get<{ data: AdminSubscription[] }>('/admin/subscriptions', { params: { pageSize: 100 } })).data.data
  });
}

export function useSubscriptionMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] });
    void queryClient.invalidateQueries({ queryKey: ['user', 'subscription'] });
    void queryClient.invalidateQueries({ queryKey: ['user', 'dashboard'] });
  };
  const update = useMutation({
    mutationFn: async ({ id, ...payload }: { id: string; planId?: string; status?: string; trafficLimitBytes?: number; trafficUsedBytes?: number; expireAt?: string | null; addDays?: number }) => (await api.patch(`/admin/subscriptions/${id}`, payload)).data,
    onSuccess: () => { toast.success('订阅已更新'); invalidate(); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '订阅更新失败'))
  });
  const resetToken = useMutation({
    mutationFn: async (id: string) => (await api.post<{ subscriptionToken: string }>(`/admin/subscriptions/${id}/reset-token`)).data,
    onSuccess: () => { toast.success('订阅 Token 已重置'); invalidate(); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, 'Token 重置失败'))
  });
  return { update, resetToken };
}
