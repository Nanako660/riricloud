import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Laptop, LayoutDashboard, Shield, Sparkles, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/lib/current-user';
import { useAuthStore } from '@/stores/auth';

interface HeroSectionProps {
  badgeText?: string;
  title?: string;
  subtitle?: string;
  registrationEnabled?: boolean;
  showPlans?: boolean;
}

export function HeroSection({
  badgeText,
  title,
  subtitle,
  registrationEnabled = false,
  showPlans = true
}: HeroSectionProps) {
  const { t } = useTranslation('landing');
  const sessionQuery = useCurrentUser();
  const storeUser = useAuthStore((s) => s.user);
  const currentUser = sessionQuery.data ?? storeUser;

  const dashboardPath = currentUser?.role === 'ADMIN' ? '/admin/nodes' : '/subscription';

  const finalBadge = badgeText?.trim() || t('hero.defaultBadge', { defaultValue: '✨ 新一代高速网络服务' });
  const finalTitle = title?.trim() || t('hero.defaultTitle', { defaultValue: '随时随地，畅享无界高速互联' });
  const finalSubtitle =
    subtitle?.trim() ||
    t('hero.defaultSubtitle', {
      defaultValue:
        '专为高清流媒体与多设备协同优化。一键轻松接入，全天候稳定护航，重塑您的数字生活体验。'
    });

  return (
    <section className="relative overflow-hidden pt-16 pb-20 sm:pt-24 sm:pb-28 md:pt-32 md:pb-36">
      {/* Background Decorative Mesh Glow */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_70%,transparent_100%)]" />
      <div className="pointer-events-none absolute top-1/3 left-1/2 -z-10 h-[280px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[120px]" />

      <div className="mx-auto max-w-5xl px-4 sm:px-6 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-muted/40 px-3.5 py-1 text-xs font-medium text-muted-foreground shadow-xs transition-colors hover:bg-muted/70">
          <Sparkles className="size-3.5 text-primary" />
          <span>{finalBadge}</span>
          <ArrowRight className="size-3 text-muted-foreground/60" />
        </div>

        {/* Heading */}
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl leading-[1.12]">
          {finalTitle}
        </h1>

        {/* Subtitle */}
        <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
          {finalSubtitle}
        </p>

        {/* CTA Buttons */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          {currentUser ? (
            <>
              <Button size="lg" className="h-11 px-6 text-sm font-semibold gap-2 shadow-xs" asChild>
                <Link to={dashboardPath}>
                  <LayoutDashboard className="size-4" />
                  <span>{t('hero.enterConsole', { defaultValue: '进入控制台' })}</span>
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              {showPlans && (
                <Button variant="outline" size="lg" className="h-11 px-6 text-sm font-medium" asChild>
                  <a href="#plans">{t('hero.browsePlans', { defaultValue: '查看套餐' })}</a>
                </Button>
              )}
            </>
          ) : (
            <>
              <Button size="lg" className="h-11 px-6 text-sm font-semibold gap-2 shadow-xs" asChild>
                <Link to={registrationEnabled ? '/register' : '/login'}>
                  <Zap className="size-4" />
                  <span>
                    {registrationEnabled
                      ? t('hero.getStarted', { defaultValue: '立即开启体验' })
                      : t('hero.loginNow', { defaultValue: '登录控制台' })}
                  </span>
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              {showPlans ? (
                <Button variant="outline" size="lg" className="h-11 px-6 text-sm font-medium" asChild>
                  <a href="#plans">{t('hero.viewPlans', { defaultValue: '了解订阅套餐' })}</a>
                </Button>
              ) : (
                <Button variant="outline" size="lg" className="h-11 px-6 text-sm font-medium" asChild>
                  <a href="#features">{t('hero.exploreFeatures', { defaultValue: '了解核心亮点' })}</a>
                </Button>
              )}
            </>
          )}
        </div>

        {/* Highlight Micro-Pills */}
        <div className="mt-14 flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 rounded-md border border-border/50 bg-card/60 px-3 py-1.5 shadow-2xs">
            <Zap className="size-3.5 text-amber-500" />
            <span className="font-medium">{t('hero.pill4k', { defaultValue: '4K 流畅播放' })}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md border border-border/50 bg-card/60 px-3 py-1.5 shadow-2xs">
            <Laptop className="size-3.5 text-blue-500" />
            <span className="font-medium">{t('hero.pillMultiDevice', { defaultValue: '多设备同享' })}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md border border-border/50 bg-card/60 px-3 py-1.5 shadow-2xs">
            <Sparkles className="size-3.5 text-purple-500" />
            <span className="font-medium">{t('hero.pillSmartRouting', { defaultValue: '智能分流加速' })}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md border border-border/50 bg-card/60 px-3 py-1.5 shadow-2xs">
            <Shield className="size-3.5 text-emerald-500" />
            <span className="font-medium">{t('hero.pillSecurity', { defaultValue: '金融级加密' })}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md border border-border/50 bg-card/60 px-3 py-1.5 shadow-2xs">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-medium">{t('hero.pillUptime', { defaultValue: '24/7 稳定在线' })}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
