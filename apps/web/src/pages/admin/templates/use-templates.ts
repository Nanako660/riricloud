import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, extractErrorMessage } from '@/lib/api';

export interface SubscriptionTemplate {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  proxyGroups: unknown[];
  ruleSets: unknown[];
  dnsConfig: Record<string, unknown>;
  customInjectYaml: string | null;
  customInjectJson: string | null;
}

export interface TemplatePayload {
  name: string;
  description?: string;
  proxyGroups: unknown[];
  ruleSets: unknown[];
  dnsConfig: Record<string, unknown>;
  customInjectYaml?: string | null;
  customInjectJson?: string | null;
  isDefault: boolean;
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
  return { create, update, remove };
}
