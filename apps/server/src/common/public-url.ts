export type PublicUrlRequest = {
  headers?: Record<string, string | string[] | undefined>;
  protocol?: string;
  get?: (name: string) => string | undefined;
};

export function normalizePublicBaseUrl(value: string | null | undefined): string | undefined {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return undefined;

  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return undefined;
    url.search = '';
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

export function getRequestBaseUrl(request: PublicUrlRequest): string | undefined {
  const forwardedProto = firstHeader(request.headers?.['x-forwarded-proto']);
  const forwardedHost = firstHeader(request.headers?.['x-forwarded-host']);
  const host = forwardedHost || request.get?.('host') || firstHeader(request.headers?.host);
  const protocol = forwardedProto || request.protocol;
  if (!host || !protocol) return undefined;
  return normalizePublicBaseUrl(`${protocol}://${host}`);
}

export function resolvePublicBaseUrl({
  configuredBaseUrl,
  requestBaseUrl,
  envPublicUrl = process.env.RIRICLOUD_PUBLIC_URL,
  port = process.env.PORT ?? '3000'
}: {
  configuredBaseUrl?: string | null;
  requestBaseUrl?: string | null;
  envPublicUrl?: string | null;
  port?: string | number;
} = {}): string {
  return (
    normalizePublicBaseUrl(configuredBaseUrl) ??
    normalizePublicBaseUrl(envPublicUrl) ??
    normalizePublicBaseUrl(requestBaseUrl) ??
    `http://localhost:${port}`
  );
}

export function appendPublicPath(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export function toWebSocketBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString().replace(/\/$/, '');
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.split(',', 1)[0]?.trim() || undefined;
}
