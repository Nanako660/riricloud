import { Outlet } from 'react-router-dom';
import { AppSidebar } from './app-sidebar';
import { AppHeader } from './app-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

// 应用外壳：侧边栏 + 顶部操作栏 + 主内容区 Inset 浮雕卡片
export function AppLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <main className="flex min-w-0 flex-1 flex-col overflow-x-hidden bg-background md:mb-4 md:mr-4 md:rounded-xl md:border md:border-sidebar-border/40 md:shadow-sm">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
