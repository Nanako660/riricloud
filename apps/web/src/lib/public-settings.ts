import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { setDefaultSystemTimezone } from './utils';

export interface PublicSystemSettings {
  siteName: string;
  siteDescription: string;
  logoUrl: string;
  faviconUrl: string;
  publicBaseUrl: string;
  siteAnnouncement: string;
  footerCopyright: string;
  supportTelegramUrl: string;
  supportDiscordUrl: string;
  supportEmail: string;
  supportCustomUrl: string;
  registrationEnabled: boolean;
  systemTimezone: string;
  subscriptionBaseUrl: string;
  subscriptionShortLinksEnabled: boolean;
  customCss: string;
  customHeadHtml: string;
  emailVerificationEnabled: boolean;
  enforceEmailVerification: boolean;
  captchaMode: 'OFF' | 'LOCAL' | 'TURNSTILE';
  turnstileSiteKey: string;
}

export function usePublicSettings() {
  return useQuery({
    queryKey: ['system', 'public-info'],
    queryFn: async () => {
      const data = (await api.get<PublicSystemSettings>('/system/public-info')).data;
      if (data?.systemTimezone) {
        setDefaultSystemTimezone(data.systemTimezone);
      }
      return data;
    },
    staleTime: 60_000
  });
}
