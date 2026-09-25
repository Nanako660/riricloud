import { useTranslation } from 'react-i18next';
import { Globe, Check } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { SUPPORTED_LANGUAGES, STORAGE_LOCALE_KEY, normalizeLocale, type SupportedLanguage } from '@/i18n/config';

interface LanguageSwitcherProps {
  showLabel?: boolean;
  className?: string;
}

export function LanguageSwitcher({ showLabel = false, className }: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation('common');
  const currentLanguage = normalizeLocale(i18n.language);

  const handleSelectLanguage = (langCode: SupportedLanguage) => {
    i18n.changeLanguage(langCode);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_LOCALE_KEY, langCode);
    }
  };

  const currentOption = SUPPORTED_LANGUAGES.find((item) => item.code === currentLanguage) ?? SUPPORTED_LANGUAGES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          variant="ghost"
          size={showLabel ? 'sm' : 'icon-sm'}
          className={className}
          title={t('languages.switcherTitle')}
          aria-label={t('languages.switcherTitle')}
        >
          <Globe className="size-4 shrink-0" />
          {showLabel && <span className="ml-1.5 text-xs font-medium">{currentOption.label}</span>}
          <span className="sr-only">{t('languages.switcherTitle')}</span>
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {SUPPORTED_LANGUAGES.map((lang) => {
          const isSelected = currentLanguage === lang.code;
          return (
            <DropdownMenuItem
              key={lang.code}
              onClick={() => handleSelectLanguage(lang.code)}
              className="flex items-center justify-between text-xs cursor-pointer"
            >
              <span>{lang.label}</span>
              {isSelected && <Check className="size-3.5 text-primary ml-2" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
