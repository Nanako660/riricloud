import type { zhCN } from '@/locales/zh-CN';

export type SupportedLanguage = 'zh-CN' | 'en-US';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: typeof zhCN;
  }
}
