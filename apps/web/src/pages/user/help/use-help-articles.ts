import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type PlatformType = 'ALL' | 'WINDOWS' | 'MACOS' | 'IOS' | 'ANDROID' | 'ROUTER' | 'FAQ' | 'GENERAL';

export interface HelpArticleItem {
  id: string;
  slug: string;
  title: string;
  platform: PlatformType;
  clientName?: string | null;
  icon?: string | null;
  summary?: string | null;
  sortOrder: number;
  locale: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserSubscriptionVariables {
  subUrl: string;
  clashImportUrl: string;
  shadowrocketImportUrl: string;
  singboxImportUrl: string;
  siteName: string;
}

export interface HelpArticleDetail extends HelpArticleItem {
  content: string;
  isPublished: boolean;
  variables: UserSubscriptionVariables;
}

export function useHelpArticles(platform?: string, locale?: string, keyword?: string) {
  return useQuery({
    queryKey: ['help-articles', platform, locale, keyword],
    queryFn: async () => {
      const { data } = await api.get<HelpArticleItem[]>('/help/articles', {
        params: {
          ...(platform && platform !== 'ALL' ? { platform } : {}),
          ...(locale ? { locale } : {}),
          ...(keyword ? { keyword } : {})
        }
      });
      return data;
    }
  });
}

export function useHelpArticleDetail(idOrSlug?: string) {
  return useQuery({
    queryKey: ['help-article-detail', idOrSlug],
    queryFn: async () => {
      if (!idOrSlug) return null;
      const { data } = await api.get<HelpArticleDetail>(`/help/articles/${idOrSlug}`);
      return data;
    },
    enabled: Boolean(idOrSlug)
  });
}
