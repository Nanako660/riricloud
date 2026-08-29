import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, extractErrorMessage } from '@/lib/api';

// 支持的入站协议（与 server common/constants.ts 对齐）
export const PROTOCOL_TYPES = ['VLESS_REALITY', 'HYSTERIA2', 'SHADOWSOCKS', 'TUIC'] as const;
export type ProtocolType = (typeof PROTOCOL_TYPES)[number];

export const PROTOCOL_LABELS: Record<ProtocolType, string> = {
  VLESS_REALITY: 'VLESS Reality',
  HYSTERIA2: 'Hysteria2',
  SHADOWSOCKS: 'Shadowsocks',
  TUIC: 'TUIC'
};

// 入站协议专属参数（结构见 docs/DATA_MODELS.md §3.1；响应已剥离 privateKey）
export interface InboundTlsParams {
  serverName: string;
  certificatePath: string;
  keyPath: string;
  alpn: string[];
  insecure: boolean;
}

export interface InboundParams {
  // VLESS_REALITY
  serverNames?: string[];
  dest?: string;
  privateKey?: string;
  publicKey?: string;
  shortIds?: string[];
  flow?: string;
  // HYSTERIA2
  upMbps?: number;
  downMbps?: number;
  tls?: InboundTlsParams;
  // TUIC
  congestionControl?: string;
  // SHADOWSOCKS
  method?: string;
  password?: string;
}

export interface NodeInbound {
  id: string;
  nodeId: string;
  type: ProtocolType;
  tag: string;
  listen: string;
  port: number;
  params: InboundParams;
  sortOrder: number;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminNode {
  id: string;
  name: string;
  serverHost: string;
  configOverride: string | null;
  agentToken: string;
  status: string;
  lastSeenAt: string | null;
  cpuUsage: number | null;
  memoryUsage: number | null;
  bandwidthRate: number | null;
  kernelRunning: boolean | null;
  configError: string | null;
  sortOrder: number;
  isPublic: boolean;
  inbounds: NodeInbound[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateNodeResult {
  node: { id: string; name: string };
  agentToken: string;
  installCommand: string;
}

export interface CreateInboundPayload {
  type: ProtocolType;
  tag?: string;
  listen?: string;
  port: number;
  params?: InboundParams;
  sortOrder?: number;
  isPublic?: boolean;
}

export interface UpdateInboundPayload {
  tag?: string;
  listen?: string;
  port?: number;
  params?: InboundParams;
  sortOrder?: number;
  isPublic?: boolean;
}

// 节点列表：5 秒轮询实时观察 Agent 在线状态与负载
export function useAdminNodes() {
  return useQuery({
    queryKey: ['admin', 'nodes'],
    queryFn: async () => (await api.get<AdminNode[]>('/admin/nodes')).data,
    refetchInterval: 5_000
  });
}

// 节点详情：入站编辑期间高频刷新（配置错误回执 / 内核状态实时可见）
export function useAdminNodeDetail(id: string) {
  return useQuery({
    queryKey: ['admin', 'nodes', 'detail', id],
    queryFn: async () => (await api.get<{ node: AdminNode }>(`/admin/nodes/${id}`)).data.node,
    refetchInterval: 5_000
  });
}

export function useNodeMutations() {
  const queryClient = useQueryClient();
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['admin', 'nodes'] });

  const invalidateSub = {
    onSuccess: () => {
      toast.success('已保存');
      invalidate();
    },
    onError: (e: unknown) => toast.error(extractErrorMessage(e, '操作失败'))
  };

  // 创建成功不弹 toast：弹窗内切换到 AgentToken 与安装命令展示页
  const createNode = useMutation({
    mutationFn: async (payload: { name?: string; serverHost: string; isPublic?: boolean }) =>
      (await api.post<CreateNodeResult>('/admin/nodes', payload)).data,
    onSuccess: () => invalidate(),
    onError: (e: unknown) => toast.error(extractErrorMessage(e, '创建失败'))
  });

  const updateNode = useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: {
      id: string;
      name?: string;
      serverHost?: string;
      isPublic?: boolean;
      sortOrder?: number;
      configOverride?: string | null;
    }) => (await api.patch(`/admin/nodes/${id}`, payload)).data,
    ...invalidateSub
  });

  const deleteNode = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/admin/nodes/${id}`)).data,
    onSuccess: () => {
      toast.success('节点已删除');
      invalidate();
    },
    onError: (e: unknown) => toast.error(extractErrorMessage(e, '删除失败'))
  });

  const reloadNode = useMutation({
    mutationFn: async (id: string) => (await api.post<{ requested: boolean }>(`/admin/nodes/${id}/reload`)).data,
    onSuccess: (data) => {
      toast.success(data.requested ? '已下发配置重载指令' : '节点不在线，稍后连接时自动同步');
      invalidate();
    },
    onError: (e: unknown) => toast.error(extractErrorMessage(e, '重载失败'))
  });

  return { createNode, updateNode, deleteNode, reloadNode };
}

// 入站 CRUD（嵌套在节点下）；变更同时刷新列表与详情
export function useInboundMutations(nodeId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'nodes'] });
  };

  const invalidateSub = {
    onSuccess: () => {
      toast.success('已保存');
      invalidate();
    },
    onError: (e: unknown) => toast.error(extractErrorMessage(e, '操作失败'))
  };

  const createInbound = useMutation({
    mutationFn: async (payload: CreateInboundPayload) =>
      (await api.post(`/admin/nodes/${nodeId}/inbounds`, payload)).data,
    ...invalidateSub
  });

  const updateInbound = useMutation({
    mutationFn: async ({ inboundId, ...payload }: UpdateInboundPayload & { inboundId: string }) =>
      (await api.patch(`/admin/nodes/${nodeId}/inbounds/${inboundId}`, payload)).data,
    ...invalidateSub
  });

  const deleteInbound = useMutation({
    mutationFn: async (inboundId: string) =>
      (await api.delete(`/admin/nodes/${nodeId}/inbounds/${inboundId}`)).data,
    onSuccess: () => {
      toast.success('入站已删除');
      invalidate();
    },
    onError: (e: unknown) => toast.error(extractErrorMessage(e, '删除失败'))
  });

  // 生成 Reality 密钥对（不落库）
  const generateKeypair = useMutation({
    mutationFn: async () =>
      (await api.post<{ privateKey: string; publicKey: string }>('/admin/nodes/reality-keypair')).data
  });

  return { createInbound, updateInbound, deleteInbound, generateKeypair };
}
