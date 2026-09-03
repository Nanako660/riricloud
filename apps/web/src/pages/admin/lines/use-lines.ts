import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, extractErrorMessage, type ApiLine, type LineStatus, type LineType, type ProtocolType, type RelayMode } from '@/lib/api';

export type { ApiLine as AdminLine };

export interface LinePayload {
  name: string;
  tag?: string | null;
  listen?: string;
  type: LineType;
  protocolType: ProtocolType;
  params: Record<string, unknown>;
  relayMode?: RelayMode | null;
  targetLineId?: string | null;
  entryNodeId: string;
  entryPort?: number | null;
  exitNodeId: string;
  exitPort?: number | null;
  certificateId?: string | null;
  endpointOverrideEnabled?: boolean;
  serverHost?: string | null;
  serverPort?: number | null;
  serverName?: string | null;
  host?: string | null;
  trafficRate?: number;
  tags?: string[];
  level?: number;
  sortOrder?: number;
  isPublic?: boolean;
  status?: LineStatus;
}

export interface LineQuery {
  search?: string;
  type?: LineType;
  status?: LineStatus;
  tag?: string;
}

export function useAdminLines(query: LineQuery = {}) {
  return useQuery({
    queryKey: ['admin', 'lines', query],
    queryFn: async () => (await api.get<{ data: ApiLine[]; total: number }>('/admin/lines', { params: { ...query, page: 1, pageSize: 100 } })).data
  });
}

export function useLineMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'lines'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'nodes'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] });
    void queryClient.invalidateQueries({ queryKey: ['user'] });
  };
  const onError = (error: unknown, fallback: string) => toast.error(extractErrorMessage(error, fallback));
  const create = useMutation({
    mutationFn: async (payload: LinePayload) => (await api.post<{ line: ApiLine }>('/admin/lines', payload)).data,
    onSuccess: () => { toast.success('线路已创建'); invalidate(); },
    onError: (error: unknown) => onError(error, '创建线路失败')
  });
  const update = useMutation({
    mutationFn: async ({ id, ...payload }: LinePayload & { id: string }) => (await api.patch<{ line: ApiLine }>(`/admin/lines/${id}`, payload)).data,
    onSuccess: () => { toast.success('线路已保存'); invalidate(); },
    onError: (error: unknown) => onError(error, '保存线路失败')
  });
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/admin/lines/${id}`)).data,
    onSuccess: () => { toast.success('线路已删除'); invalidate(); },
    onError: (error: unknown) => onError(error, '删除线路失败')
  });
  const duplicate = useMutation({
    mutationFn: async (id: string) => (await api.post<{ line: ApiLine }>(`/admin/lines/${id}/duplicate`)).data,
    onSuccess: () => { toast.success('线路副本已创建'); invalidate(); },
    onError: (error: unknown) => onError(error, '复制线路失败')
  });
  const testResolve = useMutation({
    mutationFn: async (id: string) => (await api.post(`/admin/lines/${id}/test`)).data,
    onSuccess: () => toast.success('线路解析成功'),
    onError: (error: unknown) => onError(error, '线路解析失败')
  });
  const batchStatus = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: LineStatus }) => (await api.post('/admin/lines/batch-status', { ids, status })).data,
    onSuccess: () => { toast.success('线路状态已更新'); invalidate(); },
    onError: (error: unknown) => onError(error, '批量更新失败')
  });
  const reorder = useMutation({
    mutationFn: async (items: Array<{ id: string; sortOrder: number }>) => (await api.patch('/admin/lines/reorder', { items })).data,
    onSuccess: () => { toast.success('线路顺序已更新'); invalidate(); },
    onError: (error: unknown) => onError(error, '调整顺序失败')
  });
  return { create, update, remove, duplicate, testResolve, batchStatus, reorder };
}

export function useRealityKeypair() {
  return useMutation({
    mutationFn: async () => (await api.post<{ privateKey: string; publicKey: string }>('/admin/nodes/reality-keypair')).data
  });
}
