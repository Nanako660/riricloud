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
export type CommunicationMode = 'WS' | 'HTTP';

export type ProbeResult = {
  type: 'tcp' | 'dns' | 'icmp';
  target: string;
  success: boolean;
  latencyMs?: number;
  addresses?: string[];
  packetLossPercent?: number;
  message?: string;
};

export type ProbeSnapshot = {
  taskId: string;
  success: boolean;
  results: ProbeResult[];
  completedAt: string;
};

export type BinaryTargetInfo = {
  target: string;
  kind: 'agent' | 'singbox';
  os: string;
  arch: string;
  filename: string;
  version: string;
  sha256: string;
  size: number;
  imported: boolean;
  available: boolean;
};

export type AdminBinaryInfo = {
  masterVersion: string;
  refreshedAt: string | null;
  targets: BinaryTargetInfo[];
};

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
  inner?: {
    type: 'SHADOWSOCKS';
    method: string;
    password: string;
  };
  allowLan?: boolean;
  usersEnabled?: boolean;
  overrideAddress?: string;
  overridePort?: number;
}

export interface NodeLine {
  id: string;
  name: string;
  type: 'DIRECT' | 'RELAY';
  relayMode: 'BLIND_FORWARD' | 'PROTOCOL_PROXY' | null;
  protocolType: ProtocolType;
  entryNodeId: string;
  entryPort: number;
  exitNodeId: string;
  exitPort: number;
  serverHost: string | null;
  serverPort: number | null;
  trafficRate: number;
  tags: string[];
  level: number;
  sortOrder: number;
  isPublic: boolean;
  status: 'ACTIVE' | 'DISABLED';
  role: 'ENTRY' | 'EXIT' | 'ENTRY_AND_EXIT';
  entryNode?: { id: string; name: string; serverHost: string; status: string; isLocal: boolean };
  exitNode?: { id: string; name: string; serverHost: string; status: string; isLocal: boolean };
}

export interface AdminNode {
  id: string;
  name: string;
  serverHost: string;
  isLocal: boolean;
  configOverride: string | null;
  agentToken: string;
  communicationMode: CommunicationMode;
  pollIntervalSecs: number;
  status: string;
  lastSeenAt: string | null;
  cpuUsage: number | null;
  memoryUsage: number | null;
  bandwidthRate: number | null;
  kernelRunning: boolean | null;
  configError: string | null;
  lastProbeResult: ProbeSnapshot | null;
  agentVersion: string | null;
  osArch: string | null;
  kernelVersion: string | null;
  lines: NodeLine[];
  entryLines: NodeLine[];
  exitLines: NodeLine[];
  servicePorts: Array<{ lineId: string; lineName: string; protocolType: ProtocolType; role: string; port: number }>;
  installCommands?: { ws: string; http: string };
  uninstallCommand?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNodeResult {
  node: { id: string; name: string; communicationMode?: CommunicationMode };
  agentToken: string;
  installCommand: string;
  installCommands?: { ws: string; http: string };
  uninstallCommand?: string;
}

export interface NodeTaskStatus {
  taskId: string;
  status: 'PENDING' | 'QUEUED' | 'COMPLETED';
  success?: boolean;
  message?: string;
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

export function useAdminBinaryInfo() {
  return useQuery({
    queryKey: ['admin', 'binaries', 'info'],
    queryFn: async () => (await api.get<AdminBinaryInfo>('/admin/binaries/info')).data,
    staleTime: 60_000,
    refetchInterval: 60_000
  });
}

export function useNodeMutations() {
  const queryClient = useQueryClient();
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['admin', 'nodes'] });
  const invalidateDetail = (id: string) =>
    void queryClient.invalidateQueries({ queryKey: ['admin', 'nodes', 'detail', id] });

  const invalidateSub = {
    onSuccess: () => {
      toast.success('已保存');
      invalidate();
    },
    onError: (e: unknown) => toast.error(extractErrorMessage(e, '操作失败'))
  };

  // 创建成功不弹 toast：弹窗内切换到 AgentToken 与安装命令展示页
  const createNode = useMutation({
    mutationFn: async (payload: { name?: string; serverHost: string; communicationMode?: CommunicationMode }) =>
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
      communicationMode?: CommunicationMode;
      pollIntervalSecs?: number;
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
    mutationFn: async ({ id, ...payload }: { id: string; target: 'singbox' | 'agent'; version?: string; url?: string; sha256?: string }) =>
      (await api.post(`/admin/nodes/${id}/upgrade`, payload)).data,
    onSuccess: (data, variables) => {
      toast.success(data.requested ? '升级任务已下发' : '节点不在线，升级任务未下发');
      invalidateDetail(variables.id);
    },
    onError: (e: unknown) => toast.error(extractErrorMessage(e, '升级下发失败'))
  });

  const probeNode = useMutation({
    mutationFn: async ({ id, probes }: { id: string; probes: Array<{ type: 'tcp' | 'dns' | 'icmp'; target: string; port?: number; timeoutMs?: number }> }) =>
      (await api.post(`/admin/nodes/${id}/probe`, { probes })).data,
    onSuccess: (data, variables) => {
      toast.success(data.requested ? '探针任务已下发' : '节点不在线，探针任务未下发');
      invalidateDetail(variables.id);
    },
    onError: (e: unknown) => toast.error(extractErrorMessage(e, '探针下发失败'))
  });

  const restartAgent = useMutation({
    mutationFn: async (id: string) => (await api.post<{ taskId: string; requested: boolean }>(`/admin/nodes/${id}/restart-agent`)).data,
    onSuccess: (data, id) => {
      toast.success(data.requested ? 'Agent 重启指令已下发' : '节点不在线，重启指令未下发');
      invalidateDetail(id);
    },
    onError: (e: unknown) => toast.error(extractErrorMessage(e, 'Agent 重启失败'))
  });

  const importBinary = useMutation({
    mutationFn: async (payload: { target: string; version: string; url: string; sha256: string }) =>
      (await api.post('/admin/binaries/import', payload)).data,
    onSuccess: () => {
      toast.success('自定义内核已导入主控');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'binaries', 'info'] });
    },
    onError: (e: unknown) => toast.error(extractErrorMessage(e, '内核导入失败'))
  });

  const waitForTask = async ({ nodeId, taskId, label }: { nodeId: string; taskId: string; label: string }) => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const status = (await api.get<NodeTaskStatus>(`/admin/nodes/${nodeId}/tasks/${taskId}`)).data;
      if (status.status === 'COMPLETED') {
        if (status.success) toast.success(`${label}已完成`);
        else toast.error(`${label}失败`, { description: status.message ?? 'Agent 返回失败' });
        invalidateDetail(nodeId);
        return status;
      }
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
    toast.info(`${label}仍在执行`, { description: '可稍后返回节点详情查看结果' });
    return undefined;
  };

  return { createNode, updateNode, deleteNode, reloadNode, upgradeNode, probeNode, restartAgent, importBinary, waitForTask };
}
