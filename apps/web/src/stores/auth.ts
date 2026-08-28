import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 客户端状态仅存登录态与 Token（CODE_REVIEW W2，服务端状态归 TanStack Query）
interface AuthUser {
  id: string;
  email: string;
  role: 'ADMIN' | 'USER';
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  setUser: (user: AuthUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      setUser: (user) => set({ user }),
      logout: () => set({ token: null, user: null })
    }),
    { name: 'riricloud-auth' }
  )
);
