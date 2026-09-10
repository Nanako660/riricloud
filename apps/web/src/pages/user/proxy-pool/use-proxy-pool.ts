import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, extractErrorMessage } from '@/lib/api';

export interface ProxyKey {
  id: string;
  userId: string;
  name: string;
  username: string;
  password: string;
  whitelistIps: string[];
  exportToken: string;
  isActive: boolean;
  trafficUsedBytes: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProxyPoolEndpoint {
  lineId: string;
  name: string;
  region: string | null;
  tags: string[];
  protocol: 'MIXED';
  host: string;
  port: number;
  nodeId: string;
  nodeName: string;
  nodeStatus: string;
  online: boolean;
  latencyMs: number | null;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
}

export interface ProxyKeyPayload {
  name: string;
  whitelistIps?: string;
}

export type ProxyPoolExportFormat = 'text' | 'uri' | 'json';
export type ProxyPoolExportProtocol = 'socks5' | 'http';

const KEYS_QUERY_KEY = ['user', 'proxy-pool', 'keys'] as const;
const ENDPOINTS_QUERY_KEY = ['user', 'proxy-pool', 'endpoints'] as const;

export function useProxyPoolKeys() {
  return useQuery({
    queryKey: KEYS_QUERY_KEY,
    queryFn: async () => (await api.get<{ keys: ProxyKey[]; limit: number }>('/user/proxy-pool/keys')).data
  });
}

export function useProxyPoolEndpoints() {
  return useQuery({
    queryKey: ENDPOINTS_QUERY_KEY,
    queryFn: async () => (await api.get<{ endpoints: ProxyPoolEndpoint[] }>('/user/proxy-pool/nodes')).data,
    refetchInterval: 30_000
  });
}

export interface ProxyPoolExportParams {
  keyId?: string;
  format: ProxyPoolExportFormat;
  protocol: ProxyPoolExportProtocol;
  lineIds?: string[];
  enabled?: boolean;
}

export function useProxyPoolExport(params: ProxyPoolExportParams) {
  const { keyId, format, protocol, lineIds, enabled = true } = params;
  const lineIdsValue = (lineIds ?? []).join(',');
  return useQuery({
    queryKey: ['user', 'proxy-pool', 'export', keyId ?? '', format, protocol, lineIdsValue],
    enabled: enabled && Boolean(keyId),
    queryFn: async () => {
      const response = await api.get('/user/proxy-pool/export', {
        params: {
          keyId,
          format,
          protocol,
          ...(lineIdsValue ? { lineIds: lineIdsValue } : {})
        }
      });
      const raw: unknown = response.data;
      if (typeof raw === 'string') return raw;
      return JSON.stringify(raw, null, 2);
    }
  });
}

export function useProxyPoolMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['user', 'proxy-pool'] });
  };

  const createKey = useMutation({
    mutationFn: async (payload: ProxyKeyPayload) => (await api.post<{ key: ProxyKey }>('/user/proxy-pool/keys', payload)).data,
    onSuccess: () => {
      toast.success('直连代理凭据已创建');
      invalidate();
    },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '创建凭据失败'))
  });

  const updateKey = useMutation({
    mutationFn: async ({ id, ...payload }: ProxyKeyPayload & { id: string; isActive?: boolean }) =>
      (await api.patch<{ key: ProxyKey }>(`/user/proxy-pool/keys/${id}`, payload)).data,
    onSuccess: () => {
      toast.success('凭据已更新');
      invalidate();
    },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '更新凭据失败'))
  });

  const deleteKey = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/user/proxy-pool/keys/${id}`)).data,
    onSuccess: () => {
      toast.success('凭据已删除，节点配置即时吊销');
      invalidate();
    },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '删除凭据失败'))
  });

  const rotatePassword = useMutation({
    mutationFn: async (id: string) => (await api.post<{ key: ProxyKey }>(`/user/proxy-pool/keys/${id}/rotate-password`)).data,
    onSuccess: () => {
      toast.success('密码已轮换，旧密码立即失效');
      invalidate();
    },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '轮换密码失败'))
  });

  const rotateToken = useMutation({
    mutationFn: async (id: string) => (await api.post<{ key: ProxyKey }>(`/user/proxy-pool/keys/${id}/rotate-token`)).data,
    onSuccess: () => {
      toast.success('拉取令牌已轮换，旧令牌立即失效');
      invalidate();
    },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '轮换令牌失败'))
  });

  return { createKey, updateKey, deleteKey, rotatePassword, rotateToken };
}
