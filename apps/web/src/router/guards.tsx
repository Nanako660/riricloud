import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';

// 登录态守卫：路由层声明（CODE_REVIEW W4）
export function AuthGuard() {
  const token = useAuthStore((s) => s.token);
  const location = useLocation();
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

// 管理员守卫：非 ADMIN 回落仪表盘
export function AdminGuard() {
  const user = useAuthStore((s) => s.user);
  if (user?.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
