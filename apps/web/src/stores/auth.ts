import { create } from 'zustand';

// 客户端只保留内存中的登录用户，JWT 由 HttpOnly Cookie 管理（CODE_REVIEW W2）。
export interface AuthUser {
  id: string;
  email: string;
  role: 'ADMIN' | 'USER';
  uid?: number | null;
  nickname?: string | null;
  emailVerifiedAt?: string | null;
}

interface AuthState {
  user: AuthUser | null;
  setAuth: (user: AuthUser) => void;
  setUser: (user: AuthUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setAuth: (user) => set({ user }),
  setUser: (user) => set({ user }),
  logout: () => set({ user: null })
}));
