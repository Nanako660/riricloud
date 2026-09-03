import { randomInt } from 'node:crypto';

export const DEFAULT_INBOUND_LISTEN = '0.0.0.0';
export const DEFAULT_STATS_API_LISTEN = '127.0.0.1:10085';

export function getStatsApiListen(): string {
  return process.env.STATS_API_LISTEN?.trim() || DEFAULT_STATS_API_LISTEN;
}

// 选用 20000~65535：保持五位数，并将随机上限扩展到合法端口最大值。
export const RANDOM_SERVICE_PORT_MIN = 20000;
export const RANDOM_SERVICE_PORT_MAX = 65535;

const RANDOM_SERVICE_PORT_COUNT = RANDOM_SERVICE_PORT_MAX - RANDOM_SERVICE_PORT_MIN + 1;

export async function findAvailableRandomPort(
  isAvailable: (port: number) => boolean | Promise<boolean>
): Promise<number> {
  const tried = new Set<number>();
  const randomAttempts = Math.min(64, RANDOM_SERVICE_PORT_COUNT);

  for (let attempt = 0; attempt < randomAttempts; attempt += 1) {
    const port = randomInt(RANDOM_SERVICE_PORT_MIN, RANDOM_SERVICE_PORT_MAX + 1);
    tried.add(port);
    if (await isAvailable(port)) return port;
  }

  // 随机尝试极少数冲突时，从随机起点顺序扫描，保证稀疏端口池下不会出现偶发失败。
  const start = randomInt(0, RANDOM_SERVICE_PORT_COUNT);
  for (let offset = 0; offset < RANDOM_SERVICE_PORT_COUNT; offset += 1) {
    const port = RANDOM_SERVICE_PORT_MIN + ((start + offset) % RANDOM_SERVICE_PORT_COUNT);
    if (tried.has(port)) continue;
    if (await isAvailable(port)) return port;
  }

  throw new Error('没有可用的随机服务端口');
}
