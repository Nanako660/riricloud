import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Cloud, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { UserMenu } from '@/components/layout/user-menu';
import { useCurrentUser } from '@/lib/current-user';
import { useAuthStore } from '@/stores/auth';

interface LandingHeaderProps {
  siteName: string;
  logoUrl?: string;
  registrationEnabled?: boolean;
  showFeatures?: boolean;
  showPlans?: boolean;
  showFaq?: boolean;
}

export function LandingHeader({
  siteName,
  logoUrl,
  registrationEnabled = false,
  showFeatures = true,
  showPlans = true,
  showFaq = true
}: LandingHeaderProps) {
  const { t } = useTranslation(['landing', 'common']);
  const sessionQuery = useCurrentUser();
  const storeUser = useAuthStore((s) => s.user);
  const currentUser = sessionQuery.data ?? storeUser;

  const dashboardPath = currentUser?.role === 'ADMIN' ? '/admin/nodes' : '/subscription';

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to="/"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="flex items-center gap-2.5 font-semibold text-foreground transition-opacity hover:opacity-90"
              >
                {logoUrl ? (
                  <img src={logoUrl} alt={siteName} className="size-6 rounded object-contain" />
                ) : (
                  <Cloud className="size-6 text-primary" />
                )}
                <span className="text-base font-bold tracking-tight">{siteName}</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent>{t('common:nav.home')}</TooltipContent>
          </Tooltip>

          {/* Navigation Anchors */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            {showFeatures && (
              <a href="#features" className="transition-colors hover:text-foreground">
                {t('landing:nav.features', { defaultValue: '特性优势' })}
              </a>
            )}
            {showPlans && (
              <a href="#plans" className="transition-colors hover:text-foreground">
                {t('landing:nav.plans', { defaultValue: '订阅套餐' })}
              </a>
            )}
            {showFaq && (
              <a href="#faq" className="transition-colors hover:text-foreground">
                {t('landing:nav.faq', { defaultValue: '常见问题' })}
              </a>
            )}
          </nav>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher />
          <ThemeToggle />

          {currentUser ? (
            <div className="flex items-center gap-2 pl-1">
              <Button size="sm" className="h-8 gap-1.5 px-3 text-xs font-medium shadow-none" asChild>
                <Link to={dashboardPath}>
                  <LayoutDashboard className="size-3.5" />
                  <span className="hidden sm:inline">{t('landing:header.dashboard', { defaultValue: '进入控制台' })}</span>
                  <span className="sm:hidden">{t('landing:header.dashboardShort', { defaultValue: '控制台' })}</span>
                  <ArrowRight className="size-3 hidden sm:inline" />
                </Link>
              </Button>
              <UserMenu />
            </div>
          ) : (
            <div className="flex items-center gap-2 pl-1">
              <Button variant="ghost" size="sm" className="h-8 px-3 text-xs" asChild>
                <Link to="/login">{t('landing:header.login', { defaultValue: '登录' })}</Link>
              </Button>
              {registrationEnabled && (
                <Button size="sm" className="h-8 gap-1 px-3 text-xs font-medium shadow-none" asChild>
                  <Link to="/register">
                    <span>{t('landing:header.register', { defaultValue: '立即注册' })}</span>
                  </Link>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
