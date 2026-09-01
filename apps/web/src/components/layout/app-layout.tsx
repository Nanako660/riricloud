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
        <main className="flex flex-1 flex-col bg-background md:mr-2 md:mb-2 md:rounded-xl md:border md:border-sidebar-border/40 md:shadow-sm overflow-x-hidden min-w-0">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
