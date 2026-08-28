import { NavLink } from 'react-router-dom';
import { Cloud, Gauge, Server, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';

// 侧边导航：管理员追加节点/用户管理入口
export function AppSidebar() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'ADMIN';

  const items = [
    { to: '/', label: '仪表盘', icon: Gauge },
    ...(isAdmin
      ? [
          { to: '/admin/nodes', label: '节点管理', icon: Server },
          { to: '/admin/users', label: '用户管理', icon: Users }
        ]
      : [])
  ];

  return (
    <aside className="bg-background hidden w-60 flex-col border-r md:flex">
      <div className="flex h-14 items-center gap-2 border-b px-5">
        <Cloud className="h-5 w-5" />
        <span className="font-semibold">RiriCloud</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t p-3">
        <p className="text-muted-foreground px-3 text-xs">v{__APP_VERSION__}</p>
      </div>
    </aside>
  );
}
