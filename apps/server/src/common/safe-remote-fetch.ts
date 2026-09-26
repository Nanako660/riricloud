import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_REDIRECTS = 5;

export type SafeRemoteFetchOptions = {
  maxBytes: number;
  timeoutMs?: number;
  connectTimeoutMs?: number;
  idleTimeoutMs?: number;
  signal?: AbortSignal;
  requireHttpsInProduction?: boolean;
};

export type SafeRemoteProbeOptions = {
  sampleBytes?: number;
  timeoutMs?: number;
  connectTimeoutMs?: number;
  idleTimeoutMs?: number;
  requireHttpsInProduction?: boolean;
};

export async function fetchSafeRemoteBuffer(rawUrl: string, options: SafeRemoteFetchOptions): Promise<Buffer> {
  let currentUrl = rawUrl.trim();
  const totalTimeoutMs = options.timeoutMs ?? 120_000;
  const connectTimeoutMs = options.connectTimeoutMs ?? Math.min(totalTimeoutMs, 15_000);
  const idleTimeoutMs = options.idleTimeoutMs ?? Math.min(totalTimeoutMs, 15_000);

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    if (options.signal?.aborted) {
      throw options.signal.reason instanceof Error ? options.signal.reason : new Error('remote download aborted');
    }
    const url = await assertSafeRemoteUrl(currentUrl, options.requireHttpsInProduction ?? true);
    const controller = new AbortController();
    const onExternalAbort = () => {
      controller.abort(
        options.signal?.reason instanceof Error ? options.signal.reason : new Error('remote download aborted')
      );
    };
    options.signal?.addEventListener('abort', onExternalAbort, { once: true });

    const totalTimer = setTimeout(() => controller.abort(new Error('remote download timed out')), totalTimeoutMs);
    const connectTimer = setTimeout(() => controller.abort(new Error('remote connection timed out')), connectTimeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        redirect: 'manual',
        headers: { 'User-Agent': 'RiriCloud-Master' },
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(connectTimer);
      clearTimeout(totalTimer);
      options.signal?.removeEventListener('abort', onExternalAbort);
      throw err;
    }
    clearTimeout(connectTimer);

    try {
      if (response.status >= 300 && response.status < 400) {
        clearTimeout(totalTimer);
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
      let idleTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        while (true) {
          idleTimer = setTimeout(() => {
            const stallErr = new Error('remote download stream stalled');
            controller.abort(stallErr);
            void reader.cancel(stallErr).catch(() => undefined);
          }, idleTimeoutMs);
          const chunk = await reader.read();
          clearTimeout(idleTimer);
          idleTimer = undefined;

          if (controller.signal.aborted) {
            throw controller.signal.reason instanceof Error
              ? controller.signal.reason
              : new Error('remote download stream stalled');
          }
          if (options.signal?.aborted) {
            throw options.signal.reason instanceof Error
              ? options.signal.reason
              : new Error('remote download aborted');
          }

          if (chunk.done) break;
          const buffer = Buffer.from(chunk.value);
          total += buffer.length;
          if (total > options.maxBytes) throw new Error('remote file exceeds size limit');
          chunks.push(buffer);
        }
      } finally {
        if (idleTimer) clearTimeout(idleTimer);
        reader.releaseLock();
      }
      if (!response.headers.get('content-encoding') && Number.isFinite(contentLength) && contentLength > 0 && total < contentLength) {
        throw new Error(`remote download stream truncated (${total}/${contentLength} bytes)`);
      }
      return Buffer.concat(chunks, total);
    } finally {
      clearTimeout(totalTimer);
      options.signal?.removeEventListener('abort', onExternalAbort);
    }
  }
  throw new Error('remote download failed');
}

export async function probeSafeRemoteStream(
  rawUrl: string,
  options: SafeRemoteProbeOptions = {}
): Promise<{ latencyMs: number; bytesRead: number; speedBps: number }> {
  let currentUrl = rawUrl.trim();
  const sampleBytes = options.sampleBytes ?? 64 * 1024;
  const totalTimeoutMs = options.timeoutMs ?? 7_000;
  const connectTimeoutMs = options.connectTimeoutMs ?? Math.min(totalTimeoutMs, 5_000);
  const idleTimeoutMs = options.idleTimeoutMs ?? Math.min(totalTimeoutMs, 5_000);
  const startedAt = Date.now();

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const url = await assertSafeRemoteUrl(currentUrl, options.requireHttpsInProduction ?? true);
    const controller = new AbortController();
    const totalTimer = setTimeout(() => controller.abort(new Error('测速总时间超时')), totalTimeoutMs);
    const connectTimer = setTimeout(() => controller.abort(new Error('连接超时')), connectTimeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        redirect: 'manual',
        headers: { 'User-Agent': 'RiriCloud-Master' },
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(connectTimer);
      clearTimeout(totalTimer);
      throw err;
    }
    clearTimeout(connectTimer);

    try {
      if (response.status >= 300 && response.status < 400) {
        clearTimeout(totalTimer);
        const location = response.headers.get('location');
        if (!location) throw new Error('重定向缺少 Location 响应头');
        if (redirect === MAX_REDIRECTS) throw new Error('重定向次数过多');
        currentUrl = new URL(location, url).toString();
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!response.body) throw new Error('响应体为空');

      const reader = response.body.getReader();
      let bytesRead = 0;
      let idleTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        while (bytesRead < sampleBytes) {
          idleTimer = setTimeout(() => {
            const stallErr = new Error('连接成功但无数据流返回 (0 B/s 超时)');
            controller.abort(stallErr);
            void reader.cancel(stallErr).catch(() => undefined);
          }, idleTimeoutMs);
          const chunk = await reader.read();
          clearTimeout(idleTimer);
          idleTimer = undefined;

          if (controller.signal.aborted) {
            throw controller.signal.reason instanceof Error
              ? controller.signal.reason
              : new Error('连接成功但无数据流返回 (0 B/s 超时)');
          }
          if (chunk.done) break;
          bytesRead += chunk.value.byteLength;
        }
      } finally {
        if (idleTimer) clearTimeout(idleTimer);
        void reader.cancel().catch(() => undefined);
        reader.releaseLock();
        controller.abort();
      }
      if (bytesRead === 0) {
        throw new Error('响应流未返回任何字节');
      }
      const latencyMs = Math.max(1, Date.now() - startedAt);
      const speedBps = Math.round((bytesRead * 1000) / latencyMs);
      return { latencyMs, bytesRead, speedBps };
    } finally {
      clearTimeout(totalTimer);
    }
  }
  throw new Error('测速失败');
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
