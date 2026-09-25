import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { zhCN } from '@/locales/zh-CN';
import { enUS } from '@/locales/en-US';
import { jaJP } from '@/locales/ja-JP';

export const SUPPORTED_LANGUAGES = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en-US', label: 'English' },
  { code: 'ja-JP', label: '日本語' }
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]['code'];

export const STORAGE_LOCALE_KEY = 'riricloud-locale';

export function normalizeLocale(lang?: string | null): SupportedLanguage {
  const normalized = (lang ?? '').toLowerCase();
  if (normalized.startsWith('zh')) {
    return 'zh-CN';
  }
  if (normalized.startsWith('ja')) {
    return 'ja-JP';
  }
  return 'en-US';
}

const resources = {
  'zh-CN': zhCN,
  'en-US': enUS,
  'ja-JP': jaJP
} as const;

// 优先探测用户历史选择，其次探测浏览器环境（zh- 开头适配为 zh-CN，ja- 开头适配为 ja-JP，其余默认回退至 en-US）
const detector = new LanguageDetector();
detector.addDetector({
  name: 'customNavigator',
  lookup() {
    if (typeof window === 'undefined' || !window.navigator) return undefined;
    const navLang = window.navigator.language || (window.navigator as unknown as { userLanguage?: string }).userLanguage || '';
    return normalizeLocale(navLang);
  }
});

i18n
  .use(detector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'zh-CN',
    supportedLngs: ['zh-CN', 'en-US', 'ja-JP'],
    defaultNS: 'common',
    ns: ['common', 'auth', 'user', 'admin', 'errors', 'landing'],
    detection: {
      order: ['localStorage', 'customNavigator', 'navigator'],
      lookupLocalStorage: STORAGE_LOCALE_KEY,
      caches: ['localStorage']
    },
    interpolation: {
      escapeValue: false // React 自带 XSS 防御
    }
  });

// 监听语言变化，同步更新 <html> 标签的 lang 属性
if (typeof document !== 'undefined') {
  document.documentElement.lang = normalizeLocale(i18n.language);
  i18n.on('languageChanged', (lng) => {
    document.documentElement.lang = normalizeLocale(lng);
  });
}

export default i18n;
