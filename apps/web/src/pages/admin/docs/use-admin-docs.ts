import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { PlatformType } from '@/pages/user/help/use-help-articles';

export interface AdminHelpArticle {
  id: string;
  slug: string;
  title: string;
  platform: PlatformType;
  clientName: string | null;
  icon: string | null;
  summary: string | null;
  content: string;
  sortOrder: number;
  isPublished: boolean;
  locale: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminHelpArticlePayload {
  slug: string;
  title: string;
  platform?: string;
  clientName?: string | null;
  icon?: string | null;
  summary?: string | null;
  content: string;
  sortOrder?: number;
  isPublished?: boolean;
  locale?: string;
}

export function useAdminHelpArticles(query?: { platform?: string; locale?: string; keyword?: string }) {
  return useQuery({
    queryKey: ['admin-help-articles', query],
    queryFn: async () => {
      const { data } = await api.get<AdminHelpArticle[]>('/admin/help/articles', {
        params: query
      });
      return data;
    }
  });
}

export function useAdminHelpMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-help-articles'] });
    queryClient.invalidateQueries({ queryKey: ['help-articles'] });
    queryClient.invalidateQueries({ queryKey: ['help-article-detail'] });
  };

  const createMutation = useMutation({
    mutationFn: async (payload: AdminHelpArticlePayload) => {
      const { data } = await api.post<AdminHelpArticle>('/admin/help/articles', payload);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast.success('帮助文档已成功创建');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || '创建文档失败');
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<AdminHelpArticlePayload> }) => {
      const { data } = await api.patch<AdminHelpArticle>(`/admin/help/articles/${id}`, payload);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast.success('帮助文档已保存更新');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || '更新文档失败');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete<{ success: boolean; message: string }>(`/admin/help/articles/${id}`);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast.success('帮助文档已删除');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || '删除文档失败');
    }
  });

  const resetDefaultsMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ success: boolean; count: number; message: string }>(
        '/admin/help/articles/reset-defaults'
      );
      return data;
    },
    onSuccess: (res) => {
      invalidate();
      toast.success(res.message || '已成功恢复官方预设教程');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || '恢复预设失败');
    }
  });

  return {
    createMutation,
    updateMutation,
    deleteMutation,
    resetDefaultsMutation
  };
}
