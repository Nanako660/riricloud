import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface PublicSystemSettings {
  siteName: string;
  siteDescription: string;
  logoUrl: string;
  faviconUrl: string;
  siteAnnouncement: string;
  footerCopyright: string;
  supportTelegramUrl: string;
  supportDiscordUrl: string;
  supportEmail: string;
  supportCustomUrl: string;
  registrationEnabled: boolean;
  subscriptionBaseUrl: string;
  customCss: string;
  customHeadHtml: string;
}

export function usePublicSettings() {
  return useQuery({
    queryKey: ['system', 'public-info'],
    queryFn: async () => (await api.get<PublicSystemSettings>('/system/public-info')).data,
    staleTime: 60_000
  });
}
