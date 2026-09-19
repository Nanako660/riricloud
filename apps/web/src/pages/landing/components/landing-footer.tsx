import { useTranslation } from 'react-i18next';
import { Cloud, HelpCircle, Mail, MessageSquare, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LandingFooterProps {
  siteName: string;
  siteDescription?: string;
  logoUrl?: string;
  footerCopyright?: string;
  supportTelegramUrl?: string;
  supportDiscordUrl?: string;
  supportEmail?: string;
  supportCustomUrl?: string;
}

export function LandingFooter({
  siteName,
  siteDescription,
  logoUrl,
  footerCopyright,
  supportTelegramUrl,
  supportDiscordUrl,
  supportEmail,
  supportCustomUrl
}: LandingFooterProps) {
  const { t } = useTranslation('landing');
  const currentYear = new Date().getFullYear();
  const defaultCopyright = `© ${currentYear} ${siteName}. All rights reserved.`;

  return (
    <footer className="border-t border-border/40 bg-card/40 py-12 px-4 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand and Description */}
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center gap-2.5">
              {logoUrl ? (
                <img src={logoUrl} alt={siteName} className="size-6 rounded object-contain" />
              ) : (
                <Cloud className="size-6 text-primary" />
              )}
              <span className="text-base font-bold tracking-tight text-foreground">{siteName}</span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-sm">
              {siteDescription?.trim() ||
                t('footer.defaultDescription', {
                  defaultValue: '轻量、安全、高可用的多协议代理分发与网络加速管理系统。'
                })}
            </p>
          </div>

          {/* Quick Navigation Links */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground">
              {t('footer.quickLinks', { defaultValue: '快速导航' })}
            </p>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li>
                <a href="#features" className="transition-colors hover:text-foreground">
                  {t('nav.features', { defaultValue: '核心特性' })}
                </a>
              </li>
              <li>
                <a href="#plans" className="transition-colors hover:text-foreground">
                  {t('nav.plans', { defaultValue: '订阅套餐' })}
                </a>
              </li>
              <li>
                <a href="#faq" className="transition-colors hover:text-foreground">
                  {t('nav.faq', { defaultValue: '常见问答' })}
                </a>
              </li>
            </ul>
          </div>

          {/* Support and Community Channels */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground">
              {t('footer.supportChannels', { defaultValue: '技术支持' })}
            </p>
            <div className="flex flex-wrap gap-2">
              {supportTelegramUrl && (
                <Button variant="outline" size="icon" className="size-8" asChild>
                  <a
                    href={supportTelegramUrl}
                    target="_blank"
                    rel="noreferrer"
                    title="Telegram"
                    aria-label="Telegram"
                  >
                    <Send className="size-3.5" />
                  </a>
                </Button>
              )}
              {supportDiscordUrl && (
                <Button variant="outline" size="icon" className="size-8" asChild>
                  <a
                    href={supportDiscordUrl}
                    target="_blank"
                    rel="noreferrer"
                    title="Discord"
                    aria-label="Discord"
                  >
                    <MessageSquare className="size-3.5" />
                  </a>
                </Button>
              )}
              {supportEmail && (
                <Button variant="outline" size="icon" className="size-8" asChild>
                  <a
                    href={`mailto:${supportEmail}`}
                    title={supportEmail}
                    aria-label="Email Support"
                  >
                    <Mail className="size-3.5" />
                  </a>
                </Button>
              )}
              {supportCustomUrl && (
                <Button variant="outline" size="icon" className="size-8" asChild>
                  <a
                    href={supportCustomUrl}
                    target="_blank"
                    rel="noreferrer"
                    title="Help Center"
                    aria-label="Help Center"
                  >
                    <HelpCircle className="size-3.5" />
                  </a>
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t('footer.communityNotice', { defaultValue: '加入官方交流群组以获取节点维护与更新通告。' })}
            </p>
          </div>
        </div>

        {/* Bottom Line */}
        <div className="border-t border-border/40 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>{footerCopyright?.trim() || defaultCopyright}</p>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="hover:text-foreground transition-colors cursor-pointer"
          >
            {t('footer.backToTop', { defaultValue: '回到顶部 ↑' })}
          </button>
        </div>
      </div>
    </footer>
  );
}
