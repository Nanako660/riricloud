import axios, { AxiosError } from 'axios';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth';

// 统一 API 客户端：组件内禁止裸 fetch/自建 axios 实例（CODE_REVIEW W1）
export const api = axios.create({
  baseURL: '/api/v1',
  timeout: 15_000
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string }>) => {
    const status = error.response?.status;
    const message = error.response?.data?.message ?? '请求失败，请稍后重试';
    // 401：登录态失效，清理并跳转登录页（避免在登录页自身弹跳转循环）
    if (status === 401 && useAuthStore.getState().token) {
      useAuthStore.getState().logout();
      toast.error('登录已过期，请重新登录');
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    } else if (status && status >= 500) {
      toast.error(message);
    }
    return Promise.reject(error);
  }
);

// 统一错误消息提取（表单与 mutation 复用）
export function extractErrorMessage(error: unknown, fallback = '操作失败'): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message ?? fallback;
  }
  return fallback;
}
