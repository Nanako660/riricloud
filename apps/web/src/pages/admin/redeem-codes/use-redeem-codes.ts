import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, extractErrorMessage } from '@/lib/api';

export type RedeemCodeStatus = 'UNUSED' | 'REDEEMED' | 'REVOKED' | 'EXPIRED';
export interface AdminRedeemCode {
  id: string;
  code: string;
  amount: number;
  status: RedeemCodeStatus;
  expiresAt: string | null;
  note: string | null;
  redeemedAt: string | null;
  redeemedByUserId: string | null;
  createdAt: string;
}

export function useRedeemCodes(status: RedeemCodeStatus | 'ALL') {
  return useQuery({
    queryKey: ['admin', 'redeem-codes', status],
    queryFn: async () => (await api.get<{ data: AdminRedeemCode[]; total: number }>('/admin/redeem-codes', { params: { pageSize: 100, ...(status === 'ALL' ? {} : { status }) } })).data
  });
}

export function useRedeemCodeMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['admin', 'redeem-codes'] });
  const batch = useMutation({
    mutationFn: async (payload: { count: number; amount: number; prefix?: string; expiresAt?: string | null; note?: string }) => (await api.post<{ codes: string[] }>('/admin/redeem-codes/batch', payload)).data,
    onSuccess: (data) => { toast.success(`已生成 ${data.codes.length} 张卡密`); invalidate(); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '卡密生成失败'))
  });
  const revoke = useMutation({
    mutationFn: async (id: string) => (await api.post(`/admin/redeem-codes/${id}/revoke`)).data,
    onSuccess: () => { toast.success('卡密已作废'); invalidate(); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '卡密作废失败'))
  });
  return { batch, revoke };
}
