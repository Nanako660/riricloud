import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, extractErrorMessage } from '@/lib/api';

export type BinaryKind = 'AGENT' | 'SINGBOX';
export type BinaryStatus = 'DRAFT' | 'ACTIVE' | 'DISABLED' | 'RETIRED';

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
  files: BinaryResourceFile[];
}

export interface BinaryDeployment {
  id: string;
  nodeId: string;
  assetId: string;
  kind: BinaryKind;
  operation: 'UPGRADE' | 'ROLLBACK' | string;
  status: 'QUEUED' | 'DISPATCHED' | 'COMPLETED' | 'FAILED' | string;
  attempts: number;
  errorMessage: string | null;
  requestedAt: string;
  completedAt: string | null;
  node?: { id: string; name: string };
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

export function useAdminBinaryResources() {
  return useQuery({
    queryKey: ['admin', 'binary-resources'],
    queryFn: async () => (await api.get<BinaryResource[]>('/admin/binary-resources')).data,
    staleTime: 15_000,
    refetchInterval: 30_000
  });
}

export function useAdminBinaryResource(id: string | null) {
  return useQuery({
    queryKey: ['admin', 'binary-resources', id],
    queryFn: async () => (await api.get<BinaryResource>(`/admin/binary-resources/${id}`)).data,
    enabled: Boolean(id)
  });
}

function useResourceAction(verb: 'activate' | 'disable' | 'retire' | 'default', label: string, invalidate: () => void) {
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
  const setDefault = useResourceAction('default', '默认资源已更新', invalidate);
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
    setDefault,
    importResource,
    uploadResource
  };
}
