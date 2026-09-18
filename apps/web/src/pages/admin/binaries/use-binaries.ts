import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, extractErrorMessage } from '@/lib/api';
import i18n from '@/i18n/config';

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
  storageRoot: string;
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
  // 全量匹配行（非当前页）的空间聚合：totalBytes 为登记体积，reclaimableBytes 仅计 RUNTIME 独占文件。
  summary?: { totalBytes: number; reclaimableBytes: number };
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
    onError: (error: unknown) => toast.error(extractErrorMessage(error, i18n.t('admin:binaries.opFailed')))
  });
}

export function useBinaryResourceMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'binary-resources'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'binaries', 'info'] });
  };
  const activate = useResourceAction('activate', i18n.t('admin:binaries.actActivate'), invalidate);
  const disable = useResourceAction('disable', i18n.t('admin:binaries.actDisable'), invalidate);
  const retire = useResourceAction('retire', i18n.t('admin:binaries.actRetire'), invalidate);
  const restore = useResourceAction('restore', i18n.t('admin:binaries.actRestore'), invalidate);
  const setDefault = useResourceAction('default', i18n.t('admin:binaries.actSetDefault'), invalidate);
  const removeResource = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/admin/binary-resources/${id}`)).data,
    onSuccess: () => { toast.success(i18n.t('admin:binaries.deleteSuccess')); invalidate(); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, i18n.t('admin:binaries.deleteFailed')))
  });
  const updateResource = useMutation({
    mutationFn: async ({ id, notes, compatibility }: { id: string; notes?: string | null; compatibility?: Record<string, unknown> }) =>
      (await api.patch(`/admin/binary-resources/${id}`, { notes, compatibility })).data,
    onSuccess: () => { toast.success(i18n.t('admin:binaries.updateSuccess')); invalidate(); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, i18n.t('admin:binaries.updateFailed')))
  });
  const batchResources = useMutation({
    mutationFn: async ({ action, ids }: { action: BinaryBatchAction; ids: string[] }) =>
      (await api.post<{ action: BinaryBatchAction; succeeded: number; failed: number; results: Array<{ id: string; ok: boolean; error?: string }> }>('/admin/binary-resources/batch', { action, ids })).data,
    onSuccess: (result) => {
      if (result.failed > 0) {
        const firstError = result.results.find((item) => !item.ok)?.error;
        toast.warning(i18n.t('admin:binaries.batchDoneWithErrors', {
          succeeded: result.succeeded,
          failed: result.failed,
          error: firstError ? ` (${firstError})` : ''
        }));
      } else {
        toast.success(i18n.t('admin:binaries.batchDoneSuccess', { succeeded: result.succeeded }));
      }
      invalidate();
    },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, i18n.t('admin:binaries.batchFailed')))
  });
  const retryDeployment = useMutation({
    mutationFn: async ({ nodeId, taskId }: { nodeId: string; taskId: string }) =>
      (await api.post(`/admin/nodes/${nodeId}/tasks/${taskId}/retry`)).data,
    onSuccess: () => { toast.success(i18n.t('admin:binaries.retrySuccess')); invalidate(); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, i18n.t('admin:binaries.retryFailed')))
  });
  const importResource = useMutation({
    mutationFn: async (payload: { kind: BinaryKind; upstreamVersion: string; revision?: number; target: string; filename?: string; url: string; sha256: string; builtFromAppVersion?: string; compatibilityJson?: string; notes?: string }) =>
      (await api.post('/admin/binary-resources/import', payload)).data,
    onSuccess: () => { toast.success(i18n.t('admin:binaries.importDraftSuccess')); invalidate(); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, i18n.t('admin:binaries.importDraftFailed')))
  });
  const uploadResource = useMutation({
    mutationFn: async ({ file, ...payload }: { file: File; kind: BinaryKind; upstreamVersion: string; revision?: number; target: string; filename?: string; sha256: string; builtFromAppVersion?: string; compatibilityJson?: string; notes?: string }) => {
      const form = new FormData();
      Object.entries(payload).forEach(([key, value]) => { if (value !== undefined) form.append(key, String(value)); });
      form.append('file', file);
      return (await api.post('/admin/binary-resources/upload', form)).data;
    },
    onSuccess: () => { toast.success(i18n.t('admin:binaries.uploadDraftSuccess')); invalidate(); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, i18n.t('admin:binaries.uploadDraftFailed')))
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
