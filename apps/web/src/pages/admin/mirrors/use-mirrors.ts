import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api, extractErrorMessage } from '@/lib/api';

export type MirrorAccessMode = 'ADMIN' | 'SHARE' | 'PUBLIC';

export interface ApiMirror {
  id: string;
  name: string;
  slug: string;
  enabled: boolean;
  upstreamBaseUrl: string;
  allowedOrigins: string[];
  nodeId: string;
  accessMode: MirrorAccessMode;
  shareExpiresAt: string | null;
  shareRotatedAt: string | null;
  lastRequestAt: string | null;
  lastStatusCode: number | null;
  lastErrorCode: string | null;
  node: { id: string; name: string; status: string; communicationMode: string; capabilities: string[]; supportsMirrorProxy: boolean };
}

export interface MirrorListResponse {
  items: ApiMirror[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MirrorPayload {
  name: string;
  slug: string;
  upstreamBaseUrl: string;
  allowedOrigins: string[];
  nodeId: string;
  accessMode: MirrorAccessMode;
  enabled: boolean;
  shareExpiresAt?: string;
}

export function useAdminMirrors() {
  return useQuery({
    queryKey: ['admin', 'mirrors'],
    queryFn: async () => (await api.get<MirrorListResponse>('/admin/mirrors')).data
  });
}

export function useMirrorMutations() {
  const { t } = useTranslation(['admin', 'common']);
  const queryClient = useQueryClient();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['admin', 'mirrors'] });
  const onError = (error: unknown, fallback: string) => toast.error(extractErrorMessage(error, fallback));
  const create = useMutation({
    mutationFn: async (payload: MirrorPayload) => (await api.post<{ mirror: ApiMirror; shareToken?: string }>('/admin/mirrors', payload)).data,
    onSuccess: () => { toast.success(t('admin:mirrors.toastCreated')); invalidate(); },
    onError: (error: unknown) => onError(error, t('admin:mirrors.toastCreateFailed'))
  });
  const update = useMutation({
    mutationFn: async ({ id, ...payload }: MirrorPayload & { id: string }) => (await api.patch<{ mirror: ApiMirror; shareToken?: string }>(`/admin/mirrors/${id}`, payload)).data,
    onSuccess: () => { toast.success(t('admin:mirrors.toastSaved')); invalidate(); },
    onError: (error: unknown) => onError(error, t('admin:mirrors.toastSaveFailed'))
  });
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/admin/mirrors/${id}`)).data,
    onSuccess: () => { toast.success(t('admin:mirrors.toastDeleted')); invalidate(); },
    onError: (error: unknown) => onError(error, t('admin:mirrors.toastDeleteFailed'))
  });
  const rotate = useMutation({
    mutationFn: async (id: string) => (await api.post<{ mirrorId: string; shareToken: string }>(`/admin/mirrors/${id}/rotate-share-token`)).data,
    onSuccess: () => { toast.success(t('admin:mirrors.toastTokenRotated')); invalidate(); },
    onError: (error: unknown) => onError(error, t('admin:mirrors.toastTokenRotateFailed'))
  });
  const test = useMutation({
    mutationFn: async (id: string) => (await api.post<Record<string, unknown>>(`/admin/mirrors/${id}/test`)).data,
    onError: (error: unknown) => onError(error, t('admin:mirrors.toastTestFailed'))
  });
  return { create, update, remove, rotate, test };
}
