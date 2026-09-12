import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  redeemedBy: { id: string; email: string; nickname: string | null } | null;
  createdAt: string;
}
export interface RedeemCodeStats {
  total: number;
  totalAmount: number;
  byStatus: Record<RedeemCodeStatus, { count: number; amount: number }>;
}
export interface RedeemCodeQuery {
  page: number;
  pageSize: number;
  status: RedeemCodeStatus | 'ALL';
  search: string;
}

export function useRedeemCodes(query: RedeemCodeQuery) {
  return useQuery({
    queryKey: ['admin', 'redeem-codes', query.page, query.pageSize, query.status, query.search],
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<{ data: AdminRedeemCode[]; total: number }>('/admin/redeem-codes', {
      params: {
        page: query.page,
        pageSize: query.pageSize,
        ...(query.status === 'ALL' ? {} : { status: query.status }),
        ...(query.search ? { search: query.search } : {})
      }
    })).data
  });
}

export function useRedeemCodeStats() {
  return useQuery({
    queryKey: ['admin', 'redeem-codes', 'stats'],
    queryFn: async () => (await api.get<RedeemCodeStats>('/admin/redeem-codes/stats')).data
  });
}

export function useRedeemCodeMutations(listParams: { status?: RedeemCodeStatus; search?: string } = {}) {
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
  const batchRevoke = useMutation({
    mutationFn: async (ids: string[]) => (await api.post<{ requested: number; revoked: number; skipped: number }>('/admin/redeem-codes/batch-revoke', { ids })).data,
    onSuccess: (data) => {
      toast.success(`已作废 ${data.revoked} 张卡密`, { description: data.skipped > 0 ? `${data.skipped} 张非未使用状态的卡密已自动跳过` : undefined });
      invalidate();
    },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '批量作废失败'))
  });
  const cleanup = useMutation({
    mutationFn: async (retentionDays: number) => (await api.post<{ deleted: number; retentionDays: number }>('/admin/redeem-codes/cleanup', { retentionDays })).data,
    onSuccess: (data) => { toast.success(data.deleted > 0 ? `已清理 ${data.deleted} 张过期卡密` : '没有符合条件的过期卡密'); invalidate(); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '清理过期卡密失败'))
  });
  const exportCodes = useMutation({
    mutationFn: async (format: 'csv' | 'txt') => {
      const res = await api.get('/admin/redeem-codes/export', {
        params: { format, ...(listParams.status ? { status: listParams.status } : {}), ...(listParams.search ? { search: listParams.search } : {}) },
        responseType: 'blob'
      });
      const blob = new Blob([res.data], { type: format === 'csv' ? 'text/csv;charset=utf-8;' : 'text/plain;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `riricloud-redeem-codes-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(url);
    },
    onSuccess: () => toast.success('卡密导出成功'),
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '导出卡密失败'))
  });
  return { batch, revoke, batchRevoke, cleanup, exportCodes };
}

// 卡密等值现金，列表默认掩码显示（保留前缀段与末 4 位），避免旁观截屏泄露
export function maskRedeemCode(code: string) {
  if (code.length <= 12) return '••••••';
  const dashIndex = code.indexOf('-');
  const head = dashIndex > 0 ? code.slice(0, dashIndex + 1) : code.slice(0, 4);
  return `${head}${'•'.repeat(8)}${code.slice(-4)}`;
}
