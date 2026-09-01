import { Cloud } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { usePublicSettings } from '@/lib/public-settings';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';

// 顶部操作栏：与左侧 Logo (h-14) 保持一致水平高度，位于主工作大卡片上方
export function AppHeader() {
  const publicSettings = usePublicSettings();
  const siteName = publicSettings.data?.siteName || 'RiriCloud';
  const logoUrl = publicSettings.data?.logoUrl;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 px-4 md:px-2 md:pr-4 text-sidebar-foreground">
      <div className="flex items-center gap-2 md:hidden">
        <SidebarTrigger />
        <div className="flex items-center gap-2">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="size-5 rounded object-contain" />
          ) : (
            <Cloud className="size-4.5 text-primary" />
          )}
          <span className="text-sm font-semibold tracking-tight text-foreground">{siteName}</span>
        </div>
      </div>
      <div className="hidden md:flex flex-1" />
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
