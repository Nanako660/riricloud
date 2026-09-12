import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, extractErrorMessage } from '@/lib/api';

export type BinaryKind = 'AGENT' | 'SINGBOX';
export type BinaryStatus = 'DRAFT' | 'ACTIVE' | 'DISABLED' | 'RETIRED';
export type BinaryDeploymentStatus = 'QUEUED' | 'DISPATCHED' | 'COMPLETED' | 'FAILED';
export type BinaryBatchAction = 'activate' | 'disable' | 'retire' | 'delete';

export interface BinaryResourceFile {
  id: string;
  name: string;
  role: string;
  sha256: string;
  size: number;
  storageRoot: string;
  storagePath: string;
}

export interface BinaryResourceAsset {
  id: string;
  target: string;
  os: string;
  arch: string;
  filename: string;
  sha256: string;
  size: number;
  available: boolean;
  files?: BinaryResourceFile[];
}

export interface BinaryDeployment {
  id: string;
  nodeId: string;
  assetId: string;
  kind: BinaryKind;
  operation: 'UPGRADE' | 'ROLLBACK' | string;
  status: BinaryDeploymentStatus | string;
  attempts: number;
  errorMessage: string | null;
  requestedAt: string;
  completedAt: string | null;
  node?: { id: string; name: string };
  version?: string | null;
}

export interface BinaryResource {
  id: string;
  kind: BinaryKind;
  upstreamVersion: string;
  revision: number;
  version: string;
  source: string;
  status: BinaryStatus;
  builtFromAppVersion: string | null;
  compatibilityJson: string;
  notes: string | null;
  isDefault: boolean;
  assets: BinaryResourceAsset[];
  deploymentTasks?: BinaryDeployment[];
  deploymentCount?: number;
}

export interface BinaryResourceQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  kind?: BinaryKind;
  status?: BinaryStatus;
  platform?: string;
}

export interface BinaryResourceListResult {
  data: BinaryResource[];
  total: number;
  page: number;
  pageSize: number;
  supportedTargets: string[];
}

export interface BinaryAuditLog {
  id: string;
  action: string;
  releaseId: string | null;
  assetId: string | null;
  taskId: string | null;
  nodeId: string | null;
  operatorId: string | null;
  metadataJson: string;
  createdAt: string;
  operator?: { id: string; nickname: string | null; email: string } | null;
}

// 兜底平台列表：服务端响应携带 supportedTargets，旧版本主控缺失时保底展示。
const FALLBACK_TARGETS = [
  'agent-linux-amd64', 'agent-linux-arm64', 'agent-macos-amd64', 'agent-macos-arm64', 'agent-windows-amd64',
  'singbox-linux-amd64', 'singbox-linux-arm64', 'singbox-macos-amd64', 'singbox-macos-arm64', 'singbox-windows-amd64'
];

export function useAdminBinaryResources(query: BinaryResourceQuery = {}) {
  return useQuery({
    queryKey: ['admin', 'binary-resources', query],
    queryFn: async () => {
      const params: Record<string, string | number | undefined> = {
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        search: query.search?.trim() || undefined,
        kind: query.kind,
        status: query.status,
        platform: query.platform
      };
      return (await api.get<BinaryResourceListResult>('/admin/binary-resources', { params })).data;
    },
    placeholderData: keepPreviousData,
    staleTime: 15_000
  });
}

export function useAdminBinaryResource(id: string | null) {
  return useQuery({
    queryKey: ['admin', 'binary-resources', id],
    queryFn: async () => (await api.get<BinaryResource>(`/admin/binary-resources/${id}`)).data,
    enabled: Boolean(id)
  });
}

export function useBinaryResourceDeployments(id: string | null, page: number, status?: BinaryDeploymentStatus) {
  return useQuery({
    queryKey: ['admin', 'binary-resources', id, 'deployments', page, status ?? 'ALL'],
    queryFn: async () => {
      const params: Record<string, string | number | undefined> = { page, pageSize: 10, status };
      return (await api.get<{ data: BinaryDeployment[]; total: number; page: number; pageSize: number }>(`/admin/binary-resources/${id}/deployments`, { params })).data;
    },
    enabled: Boolean(id),
    placeholderData: keepPreviousData
  });
}

export function useBinaryAuditLogs(query: { page?: number; action?: string } = {}) {
  return useQuery({
    queryKey: ['admin', 'binary-resources', 'audit-logs', query],
    queryFn: async () => {
      const params: Record<string, string | number | undefined> = { page: query.page ?? 1, pageSize: 20, action: query.action || undefined };
      return (await api.get<{ data: BinaryAuditLog[]; total: number; page: number; pageSize: number }>('/admin/binary-resources/audit-logs', { params })).data;
    },
    placeholderData: keepPreviousData
  });
}

function useResourceAction(verb: 'activate' | 'disable' | 'retire' | 'restore' | 'default', label: string, invalidate: () => void) {
  return useMutation({
    mutationFn: async (id: string) => (await api.post(`/admin/binary-resources/${id}/${verb}`)).data,
    onSuccess: () => { toast.success(label); invalidate(); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '资源操作失败'))
  });
}

export function useBinaryResourceMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'binary-resources'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'binaries', 'info'] });
  };
  const activate = useResourceAction('activate', '资源已启用', invalidate);
  const disable = useResourceAction('disable', '资源已停用', invalidate);
  const retire = useResourceAction('retire', '资源已归档', invalidate);
  const restore = useResourceAction('restore', '资源已恢复为停用状态', invalidate);
  const setDefault = useResourceAction('default', '默认资源已更新', invalidate);
  const removeResource = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/admin/binary-resources/${id}`)).data,
    onSuccess: () => { toast.success('资源已删除并清理文件'); invalidate(); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '资源删除失败'))
  });
  const updateResource = useMutation({
    mutationFn: async ({ id, notes, compatibility }: { id: string; notes?: string | null; compatibility?: Record<string, unknown> }) =>
      (await api.patch(`/admin/binary-resources/${id}`, { notes, compatibility })).data,
    onSuccess: () => { toast.success('资源信息已更新'); invalidate(); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '资源更新失败'))
  });
  const batchResources = useMutation({
    mutationFn: async ({ action, ids }: { action: BinaryBatchAction; ids: string[] }) =>
      (await api.post<{ action: BinaryBatchAction; succeeded: number; failed: number; results: Array<{ id: string; ok: boolean; error?: string }> }>('/admin/binary-resources/batch', { action, ids })).data,
    onSuccess: (result) => {
      if (result.failed > 0) {
        const firstError = result.results.find((item) => !item.ok)?.error;
        toast.warning(`批量操作完成：成功 ${result.succeeded} 项，失败 ${result.failed} 项${firstError ? `（如：${firstError}）` : ''}`);
      } else {
        toast.success(`批量操作完成：成功 ${result.succeeded} 项`);
      }
      invalidate();
    },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '批量操作失败'))
  });
  const retryDeployment = useMutation({
    mutationFn: async ({ nodeId, taskId }: { nodeId: string; taskId: string }) =>
      (await api.post(`/admin/nodes/${nodeId}/tasks/${taskId}/retry`)).data,
    onSuccess: () => { toast.success('分发任务已重新下发'); invalidate(); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '任务重试失败'))
  });
  const importResource = useMutation({
    mutationFn: async (payload: { kind: BinaryKind; upstreamVersion: string; revision?: number; target: string; filename?: string; url: string; sha256: string; builtFromAppVersion?: string; compatibilityJson?: string; notes?: string }) =>
      (await api.post('/admin/binary-resources/import', payload)).data,
    onSuccess: () => { toast.success('资源已导入为草稿'); invalidate(); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '资源导入失败'))
  });
  const uploadResource = useMutation({
    mutationFn: async ({ file, ...payload }: { file: File; kind: BinaryKind; upstreamVersion: string; revision?: number; target: string; filename?: string; sha256: string; builtFromAppVersion?: string; compatibilityJson?: string; notes?: string }) => {
      const form = new FormData();
      Object.entries(payload).forEach(([key, value]) => { if (value !== undefined) form.append(key, String(value)); });
      form.append('file', file);
      return (await api.post('/admin/binary-resources/upload', form)).data;
    },
    onSuccess: () => { toast.success('资源文件已上传为草稿'); invalidate(); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '资源上传失败'))
  });
  return {
    activate,
    disable,
    retire,
    restore,
    setDefault,
    removeResource,
    updateResource,
    batchResources,
    retryDeployment,
    importResource,
    uploadResource
  };
}

export function resolveSupportedTargets(list?: string[]) {
  return list && list.length ? list : FALLBACK_TARGETS;
}
