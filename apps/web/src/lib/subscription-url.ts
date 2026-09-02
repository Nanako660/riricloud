export interface SubscriptionUrlOptions {
  baseUrl?: string;
  shortLinksEnabled?: boolean;
  origin: string;
  token: string;
}

export function buildSubscriptionUrl({ baseUrl, shortLinksEnabled = false, origin, token }: SubscriptionUrlOptions): string {
  const resolvedBase = normalizeBaseUrl(baseUrl?.trim() || origin);
  return shortLinksEnabled ? `${resolvedBase}/${token}` : `${resolvedBase}/api/v1/sub/${token}`;
}

function normalizeBaseUrl(value: string): string {
  try {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/$/, '');
  } catch {
    return value.split(/[?#]/, 1)[0].replace(/\/+$/, '');
  }
}
