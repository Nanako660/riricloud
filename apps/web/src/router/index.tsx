import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/app-layout';
import { AdminGuard, AuthGuard } from './guards';

// 路由层声明守卫与懒加载（CODE_REVIEW W4）
export const router = createBrowserRouter([
  {
    path: '/login',
    lazy: async () => ({
      Component: (await import('@/pages/login')).default
    })
  },
  {
    element: <AuthGuard />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            path: '/',
            lazy: async () => ({
              Component: (await import('@/pages/dashboard')).default
            })
          },
          {
            element: <AdminGuard />,
            children: [
              {
                path: '/admin/nodes',
                lazy: async () => ({
                  Component: (await import('@/pages/admin/nodes')).default
                })
              },
              {
                path: '/admin/users',
                lazy: async () => ({
                  Component: (await import('@/pages/admin/users')).default
                })
              }
            ]
          }
        ]
      }
    ]
  },
  { path: '*', element: <Navigate to="/" replace /> }
]);
