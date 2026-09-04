import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, extractErrorMessage } from '@/lib/api';

export interface SubscriptionTemplate {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isBuiltin: boolean;
  proxyGroups: unknown[];
  ruleSets: unknown[];
  dnsConfig: Record<string, unknown>;
  customInjectYaml: string | null;
  customInjectJson: string | null;
}

export interface TemplatePayload {
  name: string;
  description?: string | null;
  proxyGroups: unknown[];
  ruleSets: unknown[];
  dnsConfig: Record<string, unknown>;
  customInjectYaml?: string | null;
  customInjectJson?: string | null;
  isDefault: boolean;
}

export interface TemplatePreviewResponse {
  format: 'clash' | 'singbox';
  content: string;
  stats: { totalNodes: number; matchedNodes: number; proxyGroupsCount: number; rulesCount: number };
  warnings: string[];
}

export function useAdminTemplates() {
  return useQuery({
    queryKey: ['admin', 'templates'],
    queryFn: async () => (await api.get<SubscriptionTemplate[]>('/admin/subscription-templates')).data
  });
}

export function useTemplateMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'templates'] });
  };
  const options = {
    onSuccess: () => { toast.success('模板已保存'); invalidate(); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '模板操作失败'))
  };
  const create = useMutation({ mutationFn: async (payload: TemplatePayload) => (await api.post('/admin/subscription-templates', payload)).data, ...options });
  const update = useMutation({ mutationFn: async ({ id, ...payload }: TemplatePayload & { id: string }) => (await api.patch(`/admin/subscription-templates/${id}`, payload)).data, ...options });
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/admin/subscription-templates/${id}`)).data,
    onSuccess: () => { toast.success('模板已删除'); invalidate(); },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '删除失败'))
  });
  const duplicate = useDuplicateTemplate();
  return { create, update, remove, duplicate };
}

export function useTemplatePreview() {
  return useMutation({
    mutationFn: async ({ format, template }: { format: 'clash' | 'singbox'; template: TemplatePayload }) =>
      (await api.post<TemplatePreviewResponse>('/admin/subscription-templates/preview', { format, template })).data,
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '预览渲染失败'))
  });
}

export function useDuplicateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.post<SubscriptionTemplate>(`/admin/subscription-templates/${id}/duplicate`)).data,
    onSuccess: () => {
      toast.success('模板副本已创建');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'templates'] });
    },
    onError: (error: unknown) => toast.error(extractErrorMessage(error, '复制模板失败'))
  });
}
