import { NavLink } from 'react-router-dom';
import { Cloud, Gauge, LayoutTemplate, Package, Server, Settings, ShoppingBag, Users, WalletCards } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';

// 侧边导航：结构化分组（控制台 / 管理后台）
export function AppSidebar() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'ADMIN';

  const groups = [
    {
      label: '控制台',
      items: [
        { to: '/', label: '仪表盘', icon: Gauge, end: true },
        { to: '/subscription', label: '我的订阅', icon: WalletCards, end: false },
        { to: '/market', label: '套餐市场', icon: ShoppingBag, end: false }
      ]
    },
    ...(isAdmin
      ? [
          {
            label: '管理后台',
            items: [
              { to: '/admin/users', label: '用户管理', icon: Users, end: false },
              { to: '/admin/nodes', label: '节点管理', icon: Server, end: false },
              { to: '/admin/settings', label: '系统设置', icon: Settings, end: false },
              { to: '/admin/plans', label: '套餐管理', icon: Package, end: false },
              { to: '/admin/templates', label: '订阅模板', icon: LayoutTemplate, end: false },
            ]
          }
        ]
      : [])
  ];

  return (
    <aside className="bg-background hidden w-60 flex-col border-r md:flex">
      <div className="flex h-14 items-center gap-2 border-b px-5">
        <Cloud className="h-5 w-5" />
        <span className="font-semibold">RiriCloud</span>
      </div>
      <nav className="flex flex-1 flex-col gap-4 p-3 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.label} className="space-y-1">
            <div className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </div>
            <div className="space-y-1">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-secondary text-secondary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )
                  }
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t p-3">
        <p className="text-muted-foreground px-3 text-xs">v{__APP_VERSION__}</p>
      </div>
    </aside>
  );
}
