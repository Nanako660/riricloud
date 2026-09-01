import { NavLink } from 'react-router-dom';
import { Cloud, Gauge, GitBranch, LayoutTemplate, Package, Server, Settings, ShoppingBag, Users, WalletCards } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { usePublicSettings } from '@/lib/public-settings';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar';

// 侧边导航：结构化分组（控制台 / 管理后台）
export function AppSidebar() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'ADMIN';
  const publicSettings = usePublicSettings();
  const siteName = publicSettings.data?.siteName || 'RiriCloud';
  const logoUrl = publicSettings.data?.logoUrl;

  const groups = [
    {
      label: '控制台',
      items: [
        { to: '/', label: '仪表盘', icon: Gauge, end: true },
        { to: '/subscription', label: '我的订阅', icon: WalletCards, end: false },
        { to: '/lines', label: '可用线路', icon: GitBranch, end: false },
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
              { to: '/admin/lines', label: '线路管理', icon: GitBranch, end: false },
              { to: '/admin/settings', label: '系统设置', icon: Settings, end: false },
              { to: '/admin/plans', label: '套餐管理', icon: Package, end: false },
              { to: '/admin/templates', label: '订阅模板', icon: LayoutTemplate, end: false },
            ]
          }
        ]
      : [])
  ];

  return (
    <Sidebar aria-label="主导航">
      <SidebarHeader>
        <div className="flex items-center gap-2">
          {logoUrl ? <img src={logoUrl} alt="" className="h-6 w-6 rounded object-contain" /> : <Cloud className="h-5 w-5" />}
          <span className="truncate font-semibold">{siteName}</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <NavLink to={item.to} end={item.end} className="block">
                    {({ isActive }) => (
                      <SidebarMenuButton asChild active={isActive}>
                        <span><item.icon /><span>{item.label}</span></span>
                      </SidebarMenuButton>
                    )}
                  </NavLink>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <p className="text-sidebar-foreground/55 px-3 text-xs">v{__APP_VERSION__}</p>
      </SidebarFooter>
    </Sidebar>
  );
}
