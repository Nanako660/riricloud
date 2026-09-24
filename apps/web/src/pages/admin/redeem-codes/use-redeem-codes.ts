import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, extractErrorMessage } from '@/lib/api';
import i18n from '@/i18n/config';

export type RedeemCodeStatus = 'UNUSED' | 'REDEEMED' | 'REVOKED' | 'EXPIRED';
export type RedeemReward = { type: 'BALANCE'; amount: number } | { type: 'PLAN'; planId: string; planSnapshot: { name: string } };
export interface RedeemCodeCategory {
  id: string; name: string; tags: string[]; rewardType: 'BALANCE' | 'PLAN'; rewardAmount: number | null;
  planId: string | null; plan?: { id: string; name: string } | null; limitPerIdentity: number | null;
  isActive: boolean; codeCount: number;
}
export interface AdminRedeemCode {
  id: string; code: string; amount: number; rewardType: string; reward: RedeemReward; status: RedeemCodeStatus;
  expiresAt: string | null; note: string | null; redeemedAt: string | null; redeemedByUserId: string | null;
  redeemedBy: { id: string; email: string; nickname: string | null } | null; categoryId: string | null;
  category: { id: string; name: string; tags: string[] } | null; deletedAt: string | null; createdAt: string;
}
export interface RedeemCodeStats { total: number; totalAmount: number; byStatus: Record<RedeemCodeStatus, { count: number; amount: number }> }
export interface RedeemCodeQuery {
  page: number; pageSize: number; status: RedeemCodeStatus | 'ALL'; search: string;
  categoryId?: string; deletedOnly?: boolean;
}
export interface RedeemCodeCategoryPayload {
  name: string; tags: string[]; rewardType: 'BALANCE' | 'PLAN'; rewardAmount?: number; planId?: string;
  limitPerIdentity: number | null; isActive?: boolean;
}

const rootKey = ['admin', 'redeem-codes'] as const;
export function useRedeemCodeCategories() {
  return useQuery({ queryKey: [...rootKey, 'categories'], queryFn: async () => (await api.get<RedeemCodeCategory[]>('/admin/redeem-codes/categories')).data });
}

export function useRedeemCodes(query: RedeemCodeQuery) {
  return useQuery({
    queryKey: [...rootKey, query.page, query.pageSize, query.status, query.search, query.categoryId, query.deletedOnly],
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<{ data: AdminRedeemCode[]; total: number }>('/admin/redeem-codes', { params: {
      page: query.page, pageSize: query.pageSize,
      ...(query.status === 'ALL' ? {} : { status: query.status }), ...(query.search ? { search: query.search } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}), ...(query.deletedOnly ? { deletedOnly: true } : {})
    } })).data
  });
}

export function useRedeemCodeStats(filters: { categoryId?: string; deletedOnly?: boolean } = {}) {
  return useQuery({ queryKey: [...rootKey, 'stats', filters.categoryId, filters.deletedOnly], queryFn: async () => (await api.get<RedeemCodeStats>('/admin/redeem-codes/stats', { params: filters })).data });
}

export function useRedeemCodeMutations(listParams: { status?: RedeemCodeStatus; search?: string; categoryId?: string; deletedOnly?: boolean } = {}) {
  const queryClient = useQueryClient();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: rootKey });
  const batch = useMutation({
    mutationFn: async (payload: { count: number; categoryId: string; prefix?: string; expiresAt?: string | null; note?: string }) => (await api.post<{ codes: string[] }>('/admin/redeem-codes/batch', payload)).data,
    onSuccess: (data) => { toast.success(i18n.t('admin:redeemCodes.generateSuccess', { count: data.codes.length })); invalidate(); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, i18n.t('admin:redeemCodes.generateFailed')))
  });
  const revoke = useMutation({ mutationFn: async (id: string) => (await api.post(`/admin/redeem-codes/${id}/revoke`)).data,
    onSuccess: () => { toast.success(i18n.t('admin:redeemCodes.revokeSuccess')); invalidate(); }, onError: (e: unknown) => toast.error(extractErrorMessage(e, i18n.t('admin:redeemCodes.revokeFailed'))) });
  const batchRevoke = useMutation({ mutationFn: async (ids: string[]) => (await api.post<{ requested: number; revoked: number; skipped: number }>('/admin/redeem-codes/batch-revoke', { ids })).data,
    onSuccess: (data) => { toast.success(i18n.t('admin:redeemCodes.batchRevokeSuccess', { count: data.revoked }), { description: data.skipped ? i18n.t('admin:redeemCodes.batchRevokeSkipped', { count: data.skipped }) : undefined }); invalidate(); },
    onError: (e: unknown) => toast.error(extractErrorMessage(e, i18n.t('admin:redeemCodes.batchRevokeFailed'))) });
  const batchDelete = useMutation({ mutationFn: async (ids: string[]) => (await api.post<{ deleted: number; skipped: number }>('/admin/redeem-codes/batch-delete', { ids })).data,
    onSuccess: (data) => { toast.success(i18n.t('admin:redeemCodes.deleteSuccess', { count: data.deleted })); invalidate(); }, onError: (e: unknown) => toast.error(extractErrorMessage(e, i18n.t('admin:redeemCodes.deleteFailed'))) });
  const restore = useMutation({ mutationFn: async (id: string) => (await api.post(`/admin/redeem-codes/${id}/restore`)).data,
    onSuccess: () => { toast.success(i18n.t('admin:redeemCodes.restoreSuccess')); invalidate(); }, onError: (e: unknown) => toast.error(extractErrorMessage(e, i18n.t('admin:redeemCodes.restoreFailed'))) });
  const cleanup = useMutation({ mutationFn: async (retentionDays: number) => (await api.post<{ deleted: number; retentionDays: number }>('/admin/redeem-codes/cleanup', { retentionDays })).data,
    onSuccess: (data) => { toast.success(data.deleted ? i18n.t('admin:redeemCodes.cleanupSuccess', { count: data.deleted }) : i18n.t('admin:redeemCodes.cleanupNoExpired')); invalidate(); }, onError: (e: unknown) => toast.error(extractErrorMessage(e, i18n.t('admin:redeemCodes.cleanupFailed'))) });
  const createCategory = useMutation({ mutationFn: async (payload: RedeemCodeCategoryPayload) => (await api.post('/admin/redeem-codes/categories', payload)).data,
    onSuccess: () => { toast.success(i18n.t('admin:redeemCodes.categorySaved')); invalidate(); }, onError: (e: unknown) => toast.error(extractErrorMessage(e, i18n.t('admin:redeemCodes.categorySaveFailed'))) });
  const updateCategory = useMutation({ mutationFn: async ({ id, ...payload }: RedeemCodeCategoryPayload & { id: string }) => (await api.patch(`/admin/redeem-codes/categories/${id}`, payload)).data,
    onSuccess: () => { toast.success(i18n.t('admin:redeemCodes.categorySaved')); invalidate(); }, onError: (e: unknown) => toast.error(extractErrorMessage(e, i18n.t('admin:redeemCodes.categorySaveFailed'))) });
  const exportCodes = useMutation({
    mutationFn: async (format: 'csv' | 'txt') => {
      const res = await api.get('/admin/redeem-codes/export', { params: { format, ...(listParams.status ? { status: listParams.status } : {}), ...(listParams.search ? { search: listParams.search } : {}), ...(listParams.categoryId ? { categoryId: listParams.categoryId } : {}), ...(listParams.deletedOnly ? { deletedOnly: true } : {}) }, responseType: 'blob' });
      const blob = new Blob([res.data], { type: format === 'csv' ? 'text/csv;charset=utf-8;' : 'text/plain;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url;
      anchor.download = `riricloud-redeem-codes-${new Date().toISOString().slice(0, 10)}.${format}`; document.body.appendChild(anchor); anchor.click(); document.body.removeChild(anchor); window.URL.revokeObjectURL(url);
    }, onSuccess: () => toast.success(i18n.t('admin:redeemCodes.exportSuccess')), onError: (e: unknown) => toast.error(extractErrorMessage(e, i18n.t('admin:redeemCodes.exportFailed')))
  });
  return { batch, revoke, batchRevoke, batchDelete, restore, cleanup, createCategory, updateCategory, exportCodes };
}

export function maskRedeemCode(code: string) {
  if (code.length <= 12) return '••••••';
  const dashIndex = code.indexOf('-'); const head = dashIndex > 0 ? code.slice(0, dashIndex + 1) : code.slice(0, 4);
  return `${head}${'•'.repeat(8)}${code.slice(-4)}`;
}
