import { Outlet } from 'react-router-dom';
import { AppSidebar } from './app-sidebar';
import { AppHeader } from './app-header';
import { usePublicSettings } from '@/lib/public-settings';
import { ExternalLink, Mail } from 'lucide-react';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

// 应用外壳：侧边栏 + 顶栏 + 内容区
export function AppLayout() {
  const publicSettings = usePublicSettings();
  const settings = publicSettings.data;
  const supportLinks = [
    settings?.supportTelegramUrl ? { href: settings.supportTelegramUrl, label: 'Telegram' } : null,
    settings?.supportDiscordUrl ? { href: settings.supportDiscordUrl, label: 'Discord' } : null,
    settings?.supportEmail ? { href: `mailto:${settings.supportEmail}`, label: settings.supportEmail, icon: Mail } : null,
    settings?.supportCustomUrl ? { href: settings.supportCustomUrl, label: '支持中心', icon: ExternalLink } : null
  ].filter(Boolean) as Array<{ href: string; label: string; icon?: typeof ExternalLink }>;

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <main className="flex flex-1 flex-col">
          <Outlet />
        </main>
        <footer className="flex flex-col gap-2 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between md:px-6">
          <span>{settings?.footerCopyright || `© ${new Date().getFullYear()} ${settings?.siteName || 'RiriCloud'}`}</span>
          {supportLinks.length ? (
            <nav className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="客服支持">
              {supportLinks.map(({ href, label, icon: Icon }) => (
                <a key={href} className="inline-flex items-center gap-1 hover:text-foreground" href={href} target="_blank" rel="noreferrer">
                  {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
                  {label}
                </a>
              ))}
            </nav>
          ) : null}
        </footer>
      </SidebarInset>
    </SidebarProvider>
  );
}
