import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  const queryClient = useQueryClient();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['admin', 'mirrors'] });
  const onError = (error: unknown, fallback: string) => toast.error(extractErrorMessage(error, fallback));
  const create = useMutation({
    mutationFn: async (payload: MirrorPayload) => (await api.post<{ mirror: ApiMirror; shareToken?: string }>('/admin/mirrors', payload)).data,
    onSuccess: () => { toast.success('镜像站已创建'); invalidate(); },
    onError: (error: unknown) => onError(error, '创建镜像站失败')
  });
  const update = useMutation({
    mutationFn: async ({ id, ...payload }: MirrorPayload & { id: string }) => (await api.patch<{ mirror: ApiMirror; shareToken?: string }>(`/admin/mirrors/${id}`, payload)).data,
    onSuccess: () => { toast.success('镜像站已保存'); invalidate(); },
    onError: (error: unknown) => onError(error, '保存镜像站失败')
  });
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/admin/mirrors/${id}`)).data,
    onSuccess: () => { toast.success('镜像站已删除'); invalidate(); },
    onError: (error: unknown) => onError(error, '删除镜像站失败')
  });
  const rotate = useMutation({
    mutationFn: async (id: string) => (await api.post<{ mirrorId: string; shareToken: string }>(`/admin/mirrors/${id}/rotate-share-token`)).data,
    onSuccess: () => { toast.success('分享 Token 已轮换'); invalidate(); },
    onError: (error: unknown) => onError(error, '轮换分享 Token 失败')
  });
  const test = useMutation({
    mutationFn: async (id: string) => (await api.post<Record<string, unknown>>(`/admin/mirrors/${id}/test`)).data,
    onError: (error: unknown) => onError(error, '镜像测试失败')
  });
  return { create, update, remove, rotate, test };
}
