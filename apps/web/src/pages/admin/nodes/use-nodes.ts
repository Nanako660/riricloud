import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, extractErrorMessage } from '@/lib/api';

export interface AdminNode {
  id: string;
  name: string;
  serverHost: string;
  serverPort: number;
  protocol: string;
  status: string;
  isPublic: boolean;
  lastSeenAt: string | null;
  cpuUsage: number | null;
  memoryUsage: number | null;
  bandwidthRate: number | null;
  agentToken: string;
}

export interface CreateNodeResult {
  node: { id: string; name: string };
  agentToken: string;
  installCommand: string;
}

// 节点列表：5 秒轮询实时观察 Agent 在线状态与负载
export function useAdminNodes() {
  return useQuery({
    queryKey: ['admin', 'nodes'],
    queryFn: async () => (await api.get<AdminNode[]>('/admin/nodes')).data,
    refetchInterval: 5_000
  });
}

export function useNodeMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'nodes'] });

  const invalidateSub = {
    onSuccess: () => {
      toast.success('已保存');
      void invalidate();
    },
    onError: (e: unknown) => toast.error(extractErrorMessage(e, '操作失败'))
  };

  // 创建成功不弹 toast：弹窗内切换到 AgentToken 与安装命令展示页
  const createNode = useMutation({
    mutationFn: async (payload: { name: string; serverHost: string; serverPort: number }) =>
      (await api.post<CreateNodeResult>('/admin/nodes', payload)).data,
    onSuccess: () => void invalidate(),
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
      serverPort?: number;
      isPublic?: boolean;
    }) => (await api.patch(`/admin/nodes/${id}`, payload)).data,
    ...invalidateSub
  });

  const deleteNode = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/admin/nodes/${id}`)).data,
    onSuccess: () => {
      toast.success('节点已删除');
      void invalidate();
    },
    onError: (e: unknown) => toast.error(extractErrorMessage(e, '删除失败'))
  });

  const reloadNode = useMutation({
    mutationFn: async (id: string) => (await api.post<{ requested: boolean }>(`/admin/nodes/${id}/reload`)).data,
    onSuccess: (data) => {
      toast.success(data.requested ? '已下发配置重载指令' : '节点不在线，稍后连接时自动同步');
      void invalidate();
    },
    onError: (e: unknown) => toast.error(extractErrorMessage(e, '重载失败'))
  });

  return { createNode, updateNode, deleteNode, reloadNode };
}
