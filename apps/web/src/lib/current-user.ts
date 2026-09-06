import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AuthUser } from '@/stores/auth';

// 认证用户以服务端会话为准，避免布局组件继续使用过期的内存角色。
export function useCurrentUser() {
  return useQuery<AuthUser>({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await api.get<AuthUser>('/auth/me')).data,
    retry: false,
    staleTime: 60_000
  });
}
