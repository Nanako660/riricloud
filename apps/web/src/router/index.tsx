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
    path: '/register',
    lazy: async () => ({
      Component: (await import('@/pages/register')).default
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
                path: '/admin/nodes/:id',
                lazy: async () => ({
                  Component: (await import('@/pages/admin/nodes/detail')).default
                })
              },
              {
                path: '/admin/lines',
                lazy: async () => ({
                  Component: (await import('@/pages/admin/lines')).default
                })
              },
              {
                path: '/admin/certificates',
                lazy: async () => ({
                  Component: (await import('@/pages/admin/certificates')).default
                })
              },
              {
                path: '/admin/users',
                lazy: async () => ({
                  Component: (await import('@/pages/admin/users')).default
                })
              },
              {
                path: '/admin/settings',
                lazy: async () => ({
                  Component: (await import('@/pages/admin/settings')).default
                })
              },
              {
                path: '/admin/plans',
                lazy: async () => ({
                  Component: (await import('@/pages/admin/plans')).default
                })
              },
              {
                path: '/admin/templates',
                lazy: async () => ({
                  Component: (await import('@/pages/admin/templates')).default
                })
              },
              { path: '/admin/subscriptions', element: <Navigate to="/admin/users" replace /> }
            ]
          },
          {
            path: '/market',
            lazy: async () => ({
              Component: (await import('@/pages/user/market')).default
            })
          },
          {
            path: '/subscription',
            lazy: async () => ({
              Component: (await import('@/pages/user/subscription')).default
            })
          },
          {
            path: '/lines',
            lazy: async () => ({
              Component: (await import('@/pages/user/lines')).default
            })
          }
        ]
      }
    ]
  },
  { path: '*', element: <Navigate to="/" replace /> }
]);
