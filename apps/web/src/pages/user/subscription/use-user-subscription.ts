import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, extractErrorMessage } from '@/lib/api';

export type TrafficResetMode = 'NONE' | 'CALENDAR_MONTH' | 'SUBSCRIPTION_CYCLE';
export interface UserPlan { id: string; name: string; description: string | null; price: number; durationDays: number; trafficLimitBytes: number; trafficResetMode: TrafficResetMode; lineMatchMode: string; }
export interface UserSubscription { id: string; status: 'ACTIVE' | 'CANCELED' | 'EXPIRED' | 'REVOKED'; trafficLimitBytes: number; trafficUsedBytes: number; startedAt: string; expireAt: string | null; subscriptionToken: string; trafficResetMode: TrafficResetMode; nextTrafficResetAt: string | null; extraLineIds: string[]; plan: UserPlan; }
export interface UserLine {
  id: string;
  name: string;
  protocolType: string;
  trafficRate: number;
  lastLatencyMs?: number | null;
  lastTestedAt?: string | null;
  lastTestStatus?: string | null;
  lastTestMessage?: string | null;
  exitNode: { status: string };
}

export function useUserSubscription() {
  return useQuery({
    queryKey: ['user', 'subscription'],
    queryFn: async () => (await api.get<{ subscription: UserSubscription | null; lines: UserLine[] }>('/user/subscription')).data,
    refetchInterval: 5000
  });
}

export function useUserSubscriptionMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['user', 'subscription'] });
    void queryClient.invalidateQueries({ queryKey: ['user', 'nodes'] });
  };
  const subscribe = useMutation({
    mutationFn: async (planId: string) => (await api.post('/user/subscription', { planId })).data,
    onSuccess: () => { toast.success('套餐订购成功'); invalidate(); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '订购失败'))
  });
  const upgrade = useMutation({
    mutationFn: async (planId: string) => (await api.post('/user/subscription/upgrade', { planId })).data,
    onSuccess: () => { toast.success('套餐已升配'); invalidate(); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '升配失败'))
  });
  const renew = useMutation({
    mutationFn: async () => (await api.post('/user/subscription/renew')).data,
    onSuccess: () => { toast.success('订阅续费成功'); invalidate(); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '续费失败'))
  });
  const cancel = useMutation({
    mutationFn: async () => (await api.post('/user/subscription/cancel')).data,
    onSuccess: () => { toast.success('订阅已取消，到期前仍可使用'); invalidate(); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '取消失败'))
  });
  const resetToken = useMutation({
    mutationFn: async () => (await api.post<{ subscriptionToken: string }>('/user/subscription/reset-token')).data,
    onSuccess: () => { toast.success('订阅链接已重置'); invalidate(); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '重置失败'))
  });
  return { subscribe, upgrade, renew, cancel, resetToken };
}
