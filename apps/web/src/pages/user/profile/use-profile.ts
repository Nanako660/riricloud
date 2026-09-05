import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, extractErrorMessage } from '@/lib/api';

export interface ProfileUser {
  id: string;
  uid: number | null;
  nickname: string;
  email: string;
  role: 'ADMIN' | 'USER';
  balance: number;
  uuid: string;
  trafficLimitBytes: number;
  trafficUsedBytes: number;
  expireAt: string | null;
  subscriptionToken: string;
  isActive: boolean;
  createdAt: string;
}

export interface WalletSummary {
  balance: number;
  totalIncome: number;
  totalExpense: number;
  transactionCount: number;
}

export interface WalletTransaction {
  id: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  type: string;
  description: string | null;
  createdAt: string;
}

export function useProfileUser() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await api.get<ProfileUser>('/auth/me')).data
  });
}

export function useWallet() {
  return useQuery({
    queryKey: ['user', 'wallet'],
    queryFn: async () => (await api.get<WalletSummary>('/user/wallet')).data,
    refetchInterval: 5000
  });
}

export function useWalletTransactions(page: number) {
  return useQuery({
    queryKey: ['user', 'wallet', 'transactions', page],
    queryFn: async () => (await api.get<{ data: WalletTransaction[]; total: number; page: number; pageSize: number }>('/user/wallet/transactions', { params: { page, pageSize: 10 } })).data,
    placeholderData: (previous) => previous
  });
}

export function useProfileMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    void queryClient.invalidateQueries({ queryKey: ['user', 'wallet'] });
    void queryClient.invalidateQueries({ queryKey: ['user', 'wallet', 'transactions'] });
  };
  const redeem = useMutation({
    mutationFn: async (code: string) => (await api.post('/user/wallet/redeem', { code })).data,
    onSuccess: () => { toast.success('卡密充值成功'); invalidate(); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '卡密兑换失败'))
  });
  const changePassword = useMutation({
    mutationFn: async (payload: { oldPassword: string; newPassword: string }) => (await api.post('/user/change-password', payload)).data,
    onSuccess: () => toast.success('登录密码已修改'),
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '密码修改失败'))
  });
  const resetUuid = useMutation({
    mutationFn: async () => (await api.post<{ uuid: string }>('/user/reset-uuid')).data,
    onSuccess: () => { toast.success('代理凭据已重置'); invalidate(); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '凭据重置失败'))
  });
  const updateProfile = useMutation({
    mutationFn: async (payload: { nickname: string }) => (await api.patch('/user/profile', payload)).data,
    onSuccess: () => { toast.success('昵称已更新'); invalidate(); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '昵称保存失败'))
  });
  const sendEmailCode = useMutation({
    mutationFn: async (email: string) => (await api.post('/verification/send-code', { email, action: 'CHANGE_EMAIL' })).data,
    onSuccess: () => toast.success('验证码已发送到新邮箱'),
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '验证码发送失败'))
  });
  const changeEmail = useMutation({
    mutationFn: async (payload: { newEmail: string; verificationCode: string; currentPassword: string }) => (await api.post('/user/change-email', payload)).data,
    onSuccess: () => { toast.success('登录邮箱已更换'); invalidate(); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '换绑邮箱失败'))
  });
  return { redeem, changePassword, resetUuid, updateProfile, sendEmailCode, changeEmail };
}
