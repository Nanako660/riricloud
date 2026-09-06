import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { useCurrentUser } from '@/lib/current-user';

// 登录态守卫：路由层声明（CODE_REVIEW W4）
export function AuthGuard() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const location = useLocation();
  const sessionQuery = useCurrentUser();

  useEffect(() => {
    if (sessionQuery.data) setUser(sessionQuery.data);
    if (sessionQuery.isError) logout();
  }, [logout, sessionQuery.data, sessionQuery.isError, setUser]);

  if (sessionQuery.isPending) return <div className="min-h-screen bg-muted/40" />;
  if (sessionQuery.isError) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (!user && !sessionQuery.data) return <div className="min-h-screen bg-muted/40" />;
  return <Outlet />;
}

// 管理员守卫：非 ADMIN 回落用户订阅页
export function AdminGuard() {
  const user = useAuthStore((s) => s.user);
  const sessionQuery = useCurrentUser();
  const currentUser = sessionQuery.data ?? user;
  if (sessionQuery.isPending) return <div className="min-h-screen bg-muted/40" />;
  if (currentUser?.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
