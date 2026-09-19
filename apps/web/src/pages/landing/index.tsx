import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePublicSettings } from '@/lib/public-settings';
import { useCurrentUser } from '@/lib/current-user';
import { useAuthStore } from '@/stores/auth';
import { LandingHeader } from './components/landing-header';
import { HeroSection } from './components/hero-section';
import { FeaturesSection } from './components/features-section';
import { PricingSection } from './components/pricing-section';
import { FaqSection } from './components/faq-section';
import { LandingFooter } from './components/landing-footer';
import { getEffectiveFeatures, getEffectiveFaqs } from './default-content';

export default function LandingPage() {
  const { i18n } = useTranslation();
  const settingsQuery = usePublicSettings();
  const sessionQuery = useCurrentUser();
  const storeUser = useAuthStore((s) => s.user);
  const currentUser = sessionQuery.data ?? storeUser;

  const settings = settingsQuery.data;
  const landingEnabled = settings?.landingEnabled ?? true;

  // 页面标题同步
  useEffect(() => {
    if (settings?.siteName) {
      document.title = `${settings.siteName} — ${settings.landingHeroTitle || settings.siteDescription || '随时随地，畅享无界高速互联'}`;
    }
  }, [settings?.siteName, settings?.landingHeroTitle, settings?.siteDescription]);

  // 若站长在系统设置中关闭了首页门户，优雅回退至原重定向逻辑
  if (settingsQuery.isSuccess && landingEnabled === false) {
    if (currentUser) {
      const target = currentUser.role === 'ADMIN' ? '/admin/nodes' : '/subscription';
      return <Navigate to={target} replace />;
    }
    return <Navigate to="/login" replace />;
  }

  const siteName = settings?.siteName || 'RiriCloud';
  const showFeatures = settings?.landingShowFeatures ?? true;
  const showPlans = settings?.landingShowPlans ?? true;
  const showFaq = settings?.landingShowFaq ?? true;

  const effectiveFeatures = getEffectiveFeatures(settings?.landingCustomFeaturesJson, i18n.language);
  const effectiveFaqs = getEffectiveFaqs(settings?.landingCustomFaqJson, i18n.language);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col antialiased selection:bg-primary/20 selection:text-primary">
      {/* Sticky Header */}
      <LandingHeader
        siteName={siteName}
        logoUrl={settings?.logoUrl}
        registrationEnabled={settings?.registrationEnabled}
        showFeatures={showFeatures}
        showPlans={showPlans}
        showFaq={showFaq}
      />

      {/* Main Content Sections */}
      <main className="flex-1">
        <HeroSection
          badgeText={settings?.landingHeroBadge}
          title={settings?.landingHeroTitle}
          subtitle={settings?.landingHeroSubtitle}
          registrationEnabled={settings?.registrationEnabled}
          showPlans={showPlans}
        />

        {showFeatures && <FeaturesSection features={effectiveFeatures} />}

        {showPlans && <PricingSection registrationEnabled={settings?.registrationEnabled} />}

        {showFaq && <FaqSection faqs={effectiveFaqs} />}
      </main>

      {/* Footer */}
      <LandingFooter
        siteName={siteName}
        siteDescription={settings?.siteDescription}
        logoUrl={settings?.logoUrl}
        footerCopyright={settings?.footerCopyright}
        supportTelegramUrl={settings?.supportTelegramUrl}
        supportDiscordUrl={settings?.supportDiscordUrl}
        supportEmail={settings?.supportEmail}
        supportCustomUrl={settings?.supportCustomUrl}
      />
    </div>
  );
}
