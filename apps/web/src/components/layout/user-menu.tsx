import { Link, useNavigate } from 'react-router-dom';
import { LogOut, ShieldCheck, User as UserIcon } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useCurrentUser } from '@/lib/current-user';
import { useAuthStore } from '@/stores/auth';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/ui/icon-button';
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
  const { t } = useTranslation('common');
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const profile = useCurrentUser();
  const currentUser = profile.data ?? user;

  const onLogout = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    logout();
    toast.success(t('actions.logout'));
    navigate('/login');
  };

  const displayName = currentUser?.nickname || currentUser?.email || t('status.unknown');
  const userInitial = displayName[0]?.toUpperCase() || 'U';
  const isAdmin = currentUser?.role === 'ADMIN';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          variant="ghost"
          size="icon-sm"
          className="rounded-full bg-primary/10 text-primary font-semibold text-xs border border-primary/20 hover:bg-primary/20 transition-colors"
          aria-label={t('userMenu.menuLabel')}
        >
          {userInitial}
        </IconButton>
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
                    <span>{t('userMenu.roleAdmin')}</span>
                  </>
                ) : (
                  <>
                    <UserIcon className="size-3 shrink-0" />
                    <span>{t('userMenu.roleUser')}</span>
                  </>
                )}
              </span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile"><UserIcon className="mr-2 size-4" /><span>{t('userMenu.profile')}</span></Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onLogout}
          className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut className="mr-2 size-4" />
          <span>{t('userMenu.logout')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
