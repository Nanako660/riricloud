import type { PublicSystemSettings } from './public-settings';

export function hasSupportContacts(settings?: Partial<PublicSystemSettings> | null): boolean {
  if (!settings) return false;
  return Boolean(
    settings.supportTelegramUrl?.trim() ||
    settings.supportDiscordUrl?.trim() ||
    settings.supportEmail?.trim() ||
    settings.supportCustomUrl?.trim()
  );
}
