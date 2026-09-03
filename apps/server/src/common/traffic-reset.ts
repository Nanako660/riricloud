export const TRAFFIC_RESET_MODES = ['NONE', 'CALENDAR_MONTH', 'SUBSCRIPTION_CYCLE'] as const;
export type TrafficResetMode = (typeof TRAFFIC_RESET_MODES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

export type TrafficPeriod = {
  startAt: Date;
  nextResetAt: Date;
};

export function isTrafficResetMode(value: string): value is TrafficResetMode {
  return (TRAFFIC_RESET_MODES as readonly string[]).includes(value);
}

export function getTrafficPeriod(
  mode: string,
  now: Date,
  startedAt: Date,
  durationDays: number
): TrafficPeriod | null {
  if (mode === 'NONE') return null;
  if (mode === 'CALENDAR_MONTH') {
    const startAt = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return { startAt, nextResetAt: new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0) };
  }
  if (mode !== 'SUBSCRIPTION_CYCLE' || !Number.isSafeInteger(durationDays) || durationDays < 1) return null;

  const periodMs = durationDays * DAY_MS;
  const elapsedMs = now.getTime() - startedAt.getTime();
  const periods = elapsedMs >= 0 ? Math.floor(elapsedMs / periodMs) : 0;
  const startAt = new Date(startedAt.getTime() + periods * periodMs);
  return { startAt, nextResetAt: new Date(startAt.getTime() + periodMs) };
}

export function shouldResetTraffic(
  mode: string,
  periodStartAt: Date | null,
  now: Date,
  startedAt: Date,
  durationDays: number
): boolean {
  const period = getTrafficPeriod(mode, now, startedAt, durationDays);
  return Boolean(period && periodStartAt && periodStartAt.getTime() < period.startAt.getTime());
}
