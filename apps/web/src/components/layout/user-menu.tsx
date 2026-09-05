import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LogOut, ShieldCheck, User as UserIcon } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

// 顶栏独立小巧用户菜单（点击弹出用户信息与退出）
export function UserMenu() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const profile = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await api.get<{ email: string; role: 'ADMIN' | 'USER'; uid: number | null; nickname: string }>('/auth/me')).data,
    enabled: Boolean(token),
    staleTime: 60_000
  });
  const currentUser = profile.data ?? user;

  const onLogout = () => {
    logout();
    toast.success('已退出登录');
    navigate('/login');
  };

  const displayName = currentUser?.nickname || currentUser?.email || '未登录';
  const userInitial = displayName[0]?.toUpperCase() || 'U';
  const isAdmin = currentUser?.role === 'ADMIN';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 rounded-full bg-primary/10 text-primary font-semibold text-xs border border-primary/20 hover:bg-primary/20 transition-colors"
          aria-label="用户菜单"
        >
          {userInitial}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 p-1.5 shadow-lg">
        <DropdownMenuLabel className="p-2 font-normal">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs border border-primary/20">
              {userInitial}
            </div>
            <div className="grid flex-1 text-left text-xs leading-tight min-w-0">
              <span className="truncate font-semibold text-foreground">
                {displayName}
              </span>
              <span className="truncate text-[11px] text-muted-foreground flex items-center gap-1">
                {currentUser?.uid ? <span className="font-mono">UID {currentUser.uid}</span> : null}
                {currentUser?.uid ? <span>·</span> : null}
                {isAdmin ? (
                  <>
                    <ShieldCheck className="size-3 text-emerald-500 shrink-0" />
                    <span>系统管理员</span>
                  </>
                ) : (
                  <>
                    <UserIcon className="size-3 shrink-0" />
                    <span>普通用户</span>
                  </>
                )}
              </span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile"><UserIcon className="mr-2 size-4" /><span>个人中心</span></Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onLogout}
          className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut className="mr-2 size-4" />
          <span>退出登录</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
