import { NavLink } from 'react-router-dom';
import { Activity, Cloud, Gauge, GitBranch, KeyRound, LayoutTemplate, Package, Server, Settings, ShoppingBag, Users, WalletCards, Wallet, Ticket } from 'lucide-react';
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
  SidebarMenuItem,
  useSidebar
} from '@/components/ui/sidebar';

// 侧边导航：结构化分组（控制台 / 管理后台）
export function AppSidebar() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'ADMIN';
  const { setOpenMobile } = useSidebar();
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
        { to: '/market', label: '套餐市场', icon: ShoppingBag, end: false },
        { to: '/profile', label: '个人中心', icon: Wallet, end: false }
      ]
    },
    ...(isAdmin
      ? [
          {
            label: '管理后台',
            items: [
              { to: '/admin/users', label: '用户管理', icon: Users, end: false },
              { to: '/admin/traffic', label: '流量统计', icon: Activity, end: false },
              { to: '/admin/nodes', label: '节点管理', icon: Server, end: false },
              { to: '/admin/lines', label: '线路管理', icon: GitBranch, end: false },
              { to: '/admin/certificates', label: '证书管理', icon: KeyRound, end: false },
              { to: '/admin/plans', label: '套餐管理', icon: Package, end: false },
              { to: '/admin/templates', label: '订阅模板', icon: LayoutTemplate, end: false },
              { to: '/admin/redeem-codes', label: '卡密管理', icon: Ticket, end: false },
              { to: '/admin/settings', label: '系统设置', icon: Settings, end: false },
            ]
          }
        ]
      : [])
  ];

  return (
    <Sidebar variant="inset" aria-label="主导航">
      <SidebarHeader className="h-14 justify-center px-4">
        <div className="flex items-center gap-2.5 px-1">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
            {logoUrl ? <img src={logoUrl} alt="" className="size-4.5 rounded object-contain" /> : <Cloud className="size-4" />}
          </div>
          <span className="truncate font-semibold tracking-tight text-sidebar-foreground text-sm">{siteName}</span>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-2">
        {groups.map((group) => (
          <SidebarGroup key={group.label} className="py-1">
            <SidebarGroupLabel className="text-[11px] font-semibold tracking-wider text-sidebar-foreground/50 uppercase px-3 py-1">
              {group.label}
            </SidebarGroupLabel>
            <SidebarMenu className="gap-0.5">
              {group.items.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <NavLink to={item.to} end={item.end} className="block" onClick={() => setOpenMobile(false)}>
                    {({ isActive }) => (
                      <SidebarMenuButton asChild active={isActive} className="rounded-lg px-3 py-2 text-sm">
                        <span><item.icon className="size-4" /><span>{item.label}</span></span>
                      </SidebarMenuButton>
                    )}
                  </NavLink>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="p-3">
        <p className="text-sidebar-foreground/45 px-2 text-[11px] text-center">v{__APP_VERSION__}</p>
      </SidebarFooter>
    </Sidebar>
  );
}
