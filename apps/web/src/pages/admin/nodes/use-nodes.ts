import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, extractErrorMessage } from '@/lib/api';

// 支持的入站协议（与 server common/constants.ts 对齐）
export const PROTOCOL_TYPES = [
  'VLESS',
  'VMESS',
  'TROJAN',
  'HYSTERIA2',
  'TUIC',
  'SHADOWSOCKS',
  'NAIVE',
  'SHADOWTLS',
  'MIXED',
  'SOCKS',
  'HTTP',
  'DIRECT'
] as const;
export type ProtocolType = (typeof PROTOCOL_TYPES)[number];

export const PROTOCOL_LABELS: Record<ProtocolType, string> = {
  VLESS: 'VLESS',
  VMESS: 'VMess',
  TROJAN: 'Trojan',
  HYSTERIA2: 'Hysteria 2',
  TUIC: 'TUIC v5',
  SHADOWSOCKS: 'Shadowsocks',
  NAIVE: 'NaiveProxy',
  SHADOWTLS: 'ShadowTLS',
  MIXED: 'Mixed (SOCKS5/HTTP)',
  SOCKS: 'SOCKS5',
  HTTP: 'HTTP',
  DIRECT: 'Direct'
};

export type TransportType = 'tcp' | 'ws' | 'grpc' | 'http' | 'httpupgrade';

export interface InboundTransport {
  type: TransportType;
  path?: string;
  host?: string;
  serviceName?: string;
  headers?: Record<string, string>;
  maxEarlyData?: number;
  earlyDataHeaderName?: string;
}

export type TlsMode = 'none' | 'tls' | 'reality' | 'acme';

export interface InboundRealityConfig {
  dest: string;
  serverNames: string[];
  privateKey?: string;
  publicKey: string;
  shortIds: string[];
}

export interface InboundAcmeConfig {
  domain: string;
  email: string;
  provider?: string;
}

export interface InboundTlsConfig {
  enabled: boolean;
  mode: TlsMode;
  serverName?: string;
  certificatePath?: string;
  keyPath?: string;
  acme?: InboundAcmeConfig;
  reality?: InboundRealityConfig;
  alpn?: string[];
  insecure?: boolean;
}

// 入站协议专属参数（响应已剥离 privateKey）
export interface InboundParams {
  flow?: string;
  transport?: InboundTransport;
  tls?: InboundTlsConfig;
  alterId?: number;
  upMbps?: number;
  downMbps?: number;
  ignoreClientBandwidth?: boolean;
  obfs?: {
    type: string;
    password?: string;
  };
  congestionControl?: string;
  zeroRttHandshake?: boolean;
  heartbeat?: string;
  method?: string;
  password?: string;
  mode?: 'shared' | 'multi-user';
  network?: string;
  version?: number;
  handshakeDest?: string;
  strictMode?: boolean;
  allowLan?: boolean;
  usersEnabled?: boolean;
  overrideAddress?: string;
  overridePort?: number;
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
  createdAt: string;
  updatedAt: string;
}

export interface NodeLine {
  id: string;
  name: string;
  type: 'DIRECT' | 'RELAY';
  relayMode: 'BLIND_FORWARD' | 'PROTOCOL_PROXY' | null;
  entryNodeId: string | null;
  entryPort: number | null;
  targetInboundId: string;
  serverHost: string | null;
  serverPort: number | null;
  serverName: string | null;
  host: string | null;
  trafficRate: number;
  tags: string[];
  level: number;
  sortOrder: number;
  isPublic: boolean;
  status: 'ACTIVE' | 'DISABLED';
  targetInbound: { id: string; type: ProtocolType; tag: string; port: number };
}

export interface AdminNode {
  id: string;
  name: string;
  serverHost: string;
  isLocal: boolean;
  configOverride: string | null;
  agentToken: string;
  status: string;
  lastSeenAt: string | null;
  cpuUsage: number | null;
  memoryUsage: number | null;
  bandwidthRate: number | null;
  kernelRunning: boolean | null;
  configError: string | null;
  inbounds: NodeInbound[];
  entryLines: NodeLine[];
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
  port?: number;
  params?: InboundParams;
  sortOrder?: number;
}

export interface UpdateInboundPayload {
  tag?: string;
  listen?: string;
  port?: number;
  params?: InboundParams;
  sortOrder?: number;
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
    mutationFn: async (payload: { name?: string; serverHost: string }) =>
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

  const upgradeNode = useMutation({
    mutationFn: async ({ id, ...payload }: { id: string; target: 'singbox' | 'agent'; version: string; url: string; sha256: string }) =>
      (await api.post(`/admin/nodes/${id}/upgrade`, payload)).data,
    onSuccess: (data) => toast.success(data.requested ? '升级任务已下发' : '节点不在线，升级任务未下发'),
    onError: (e: unknown) => toast.error(extractErrorMessage(e, '升级下发失败'))
  });

  const probeNode = useMutation({
    mutationFn: async ({ id, probes }: { id: string; probes: Array<{ type: 'tcp' | 'dns' | 'icmp'; target: string; port?: number; timeoutMs?: number }> }) =>
      (await api.post(`/admin/nodes/${id}/probe`, { probes })).data,
    onSuccess: () => toast.success('探针任务已下发'),
    onError: (e: unknown) => toast.error(extractErrorMessage(e, '探针下发失败'))
  });

  return { createNode, updateNode, deleteNode, reloadNode, upgradeNode, probeNode };
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

  const deriveLine = useMutation({
    mutationFn: async (inboundId: string) =>
      (await api.post(`/admin/nodes/${nodeId}/inbounds/${inboundId}/derive-line`)).data,
    onSuccess: () => {
      toast.success('线路已派生');
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['admin', 'lines'] });
    },
    onError: (e: unknown) => toast.error(extractErrorMessage(e, '派生线路失败'))
  });

  // 生成 Reality 密钥对（不落库）
  const generateKeypair = useMutation({
    mutationFn: async () =>
      (await api.post<{ privateKey: string; publicKey: string }>('/admin/nodes/reality-keypair')).data
  });

  return { createInbound, updateInbound, deleteInbound, deriveLine, generateKeypair };
}
