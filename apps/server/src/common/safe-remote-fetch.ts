import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_REDIRECTS = 3;

export type SafeRemoteFetchOptions = {
  maxBytes: number;
  timeoutMs?: number;
  requireHttpsInProduction?: boolean;
};

export async function fetchSafeRemoteBuffer(rawUrl: string, options: SafeRemoteFetchOptions): Promise<Buffer> {
  let currentUrl = rawUrl.trim();
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const url = await assertSafeRemoteUrl(currentUrl, options.requireHttpsInProduction ?? true);
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(options.timeoutMs ?? 120_000)
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('remote download redirect is missing Location');
      if (redirect === MAX_REDIRECTS) throw new Error('remote download exceeded redirect limit');
      currentUrl = new URL(location, url).toString();
      continue;
    }
    if (!response.ok) throw new Error(`remote download failed: HTTP ${response.status}`);

    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (Number.isFinite(contentLength) && contentLength > options.maxBytes) {
      throw new Error('remote file exceeds size limit');
    }
    if (!response.body) throw new Error('remote download returned an empty body');
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        const buffer = Buffer.from(chunk.value);
        total += buffer.length;
        if (total > options.maxBytes) throw new Error('remote file exceeds size limit');
        chunks.push(buffer);
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks, total);
  }
  throw new Error('remote download failed');
}

export async function assertSafeRemoteUrl(rawUrl: string, requireHttpsInProduction = true): Promise<string> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('remote URL must be absolute');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('remote URL must use http or https without embedded credentials');
  }
  if (isProductionLike() && requireHttpsInProduction && url.protocol !== 'https:') {
    throw new Error('production remote downloads require HTTPS');
  }
  const hostname = url.hostname.replace(/\.$/, '').toLowerCase();
  if (!hostname) throw new Error('remote URL hostname is required');
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new Error('remote URL resolves to a private or metadata address');
  }
  return url.toString();
}

function isProductionLike(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.RIRICLOUD_ENV === 'production';
}

function isBlockedAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const octets = address.split('.').map(Number);
    const [a, b, c, d] = octets;
    return a === 0 || a === 10 || a === 127 || a === 169 && b === 254 ||
      a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 ||
      a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19) ||
      a === 192 && b === 0 && c === 2 || a === 198 && b === 51 && c === 100 ||
      a === 203 && b === 0 && c === 113 || a >= 224 ||
      a === 169 && b === 254 && c === 169 && d === 254;
  }
  const normalized = address.toLowerCase().split('%')[0];
  return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') ||
    normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
    normalized.startsWith('fea') || normalized.startsWith('feb') ||
    normalized.startsWith('::ffff:127.') || normalized.startsWith('::ffff:10.') ||
    normalized.startsWith('::ffff:192.168.') || normalized.startsWith('::ffff:169.254.');
}
