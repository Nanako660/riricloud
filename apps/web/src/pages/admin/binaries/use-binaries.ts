import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, extractErrorMessage } from '@/lib/api';
import i18n from '@/i18n/config';

export type BinaryKind = 'AGENT';
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
  assetId: string | null;
  kind: BinaryKind | string;
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
  // 全量匹配行（非当前页）的空间聚合
  summary?: { totalBytes: number; reclaimableBytes: number };
}

export interface GithubReleaseAssetItem {
  target: string;
  os: string;
  arch: string;
  name: string;
  size: number;
  downloadUrl: string;
  imported: boolean;
}

export interface GithubReleaseItem {
  tagName: string;
  version: string;
  name: string;
  publishedAt: string | null;
  prerelease: boolean;
  htmlUrl: string;
  notes: string | null;
  existingReleaseId: string | null;
  existingStatus: string | null;
  assets: GithubReleaseAssetItem[];
}

export interface GithubReleasesResponse {
  repoUrl: string;
  githubRepoUrl?: string;
  owner: string;
  repo: string;
  githubMirrorUrls?: string[];
  releases: GithubReleaseItem[];
}

// 兜底平台列表：仅包含 5 个 Agent 架构目标
const FALLBACK_TARGETS = [
  'agent-linux-amd64',
  'agent-linux-arm64',
  'agent-macos-amd64',
  'agent-macos-arm64',
  'agent-windows-amd64'
];

export function useAdminBinaryResources(query: BinaryResourceQuery = {}) {
  return useQuery({
    queryKey: ['admin', 'binary-resources', query],
    queryFn: async () => {
      const params: Record<string, string | number | undefined> = {
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        search: query.search?.trim() || undefined,
        status: query.status,
        platform: query.platform
      };
      return (await api.get<BinaryResourceListResult>('/admin/binary-resources', { params })).data;
    },
    placeholderData: keepPreviousData,
    staleTime: 5_000
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

export function useGithubReleases(options: { repoUrl?: string; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['admin', 'binary-resources', 'github-releases', options.repoUrl ?? 'default'],
    queryFn: async () => {
      const params = options.repoUrl?.trim() ? { repoUrl: options.repoUrl.trim() } : undefined;
      return (await api.get<GithubReleasesResponse>('/admin/binary-resources/github-releases', { params, timeout: 30_000 })).data;
    },
    enabled: options.enabled ?? true,
    staleTime: 0,
    refetchOnMount: 'always',
    retry: 1
  });
}

function useResourceAction(verb: 'activate' | 'disable' | 'retire' | 'restore' | 'default', label: string, invalidate: () => void) {
  return useMutation({
    mutationFn: async (id: string) => (await api.post(`/admin/binary-resources/${id}/${verb}`)).data,
    onSuccess: () => { toast.success(label); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, i18n.t('admin:binaries.opFailed'))),
    onSettled: () => invalidate()
  });
}

export function useBinaryResourceMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'binary-resources'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'binaries', 'info'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-logs'] });
  };
  const activate = useResourceAction('activate', i18n.t('admin:binaries.actActivate'), invalidate);
  const disable = useResourceAction('disable', i18n.t('admin:binaries.actDisable'), invalidate);
  const retire = useResourceAction('retire', i18n.t('admin:binaries.actRetire'), invalidate);
  const restore = useResourceAction('restore', i18n.t('admin:binaries.actRestore'), invalidate);
  const setDefault = useResourceAction('default', i18n.t('admin:binaries.actSetDefault'), invalidate);

  const removeResource = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/admin/binary-resources/${id}`)).data,
    onSuccess: () => { toast.success(i18n.t('admin:binaries.deleteSuccess')); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, i18n.t('admin:binaries.deleteFailed'))),
    onSettled: () => invalidate()
  });

  const updateResource = useMutation({
    mutationFn: async ({ id, notes, compatibility }: { id: string; notes?: string | null; compatibility?: Record<string, unknown> }) =>
      (await api.patch(`/admin/binary-resources/${id}`, { notes, compatibility })).data,
    onSuccess: () => { toast.success(i18n.t('admin:binaries.updateSuccess')); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, i18n.t('admin:binaries.updateFailed'))),
    onSettled: () => invalidate()
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
    },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, i18n.t('admin:binaries.batchFailed'))),
    onSettled: () => invalidate()
  });

  const retryDeployment = useMutation({
    mutationFn: async ({ nodeId, taskId }: { nodeId: string; taskId: string }) =>
      (await api.post(`/admin/nodes/${nodeId}/tasks/${taskId}/retry`)).data,
    onSuccess: () => { toast.success(i18n.t('admin:binaries.retrySuccess')); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, i18n.t('admin:binaries.retryFailed'))),
    onSettled: () => invalidate()
  });

  const importResource = useMutation({
    mutationFn: async (payload: { url: string; upstreamVersion?: string; target?: string; notes?: string }) =>
      (await api.post('/admin/binary-resources/import', payload, { timeout: 300_000 })).data,
    onSuccess: () => { toast.success(i18n.t('admin:binaries.importDraftSuccess')); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, i18n.t('admin:binaries.importDraftFailed'))),
    onSettled: () => invalidate()
  });

  const uploadResource = useMutation({
    mutationFn: async ({ files, upstreamVersion, target, notes }: { files: File[]; upstreamVersion?: string; target?: string; notes?: string }) => {
      const results = [];
      for (const file of files) {
        const form = new FormData();
        if (upstreamVersion?.trim()) form.append('upstreamVersion', upstreamVersion.trim());
        if (target?.trim() && files.length === 1) form.append('target', target.trim());
        if (notes?.trim()) form.append('notes', notes.trim());
        form.append('file', file);
        const res = await api.post('/admin/binary-resources/upload', form, { timeout: 300_000 });
        results.push(res.data);
      }
      return results;
    },
    onSuccess: (results) => {
      toast.success(i18n.t('admin:binaries.uploadDraftSuccess', { count: results.length }));
    },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, i18n.t('admin:binaries.uploadDraftFailed'))),
    onSettled: () => invalidate()
  });

  const importGithubRelease = useMutation({
    mutationFn: async (payload: { tagName: string; targets?: string[]; repoUrl?: string }) =>
      (await api.post<{
        tagName: string;
        version: string;
        succeeded: number;
        failed: number;
        results: Array<{ target: string; ok: boolean; error?: string }>;
      }>('/admin/binary-resources/github-import', payload, { timeout: 600_000 })).data,
    onSuccess: (result) => {
      if (result.failed > 0) {
        const firstError = result.results.find((item) => !item.ok)?.error;
        toast.warning(i18n.t('admin:binaries.githubImportPartial', {
          succeeded: result.succeeded,
          failed: result.failed,
          error: firstError ? ` (${firstError})` : ''
        }));
      } else {
        toast.success(i18n.t('admin:binaries.githubImportSuccess', {
          tag: result.tagName,
          succeeded: result.succeeded
        }));
      }
    },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, i18n.t('admin:binaries.githubImportFailed'))),
    onSettled: () => invalidate()
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
    uploadResource,
    importGithubRelease
  };
}

export function resolveSupportedTargets(list?: string[]) {
  return list && list.length ? list : FALLBACK_TARGETS;
}
