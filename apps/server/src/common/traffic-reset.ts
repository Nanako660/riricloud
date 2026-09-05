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

export function getTimeZoneParts(date: Date, timeZone = 'Asia/Shanghai') {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false
    });
    const parts = formatter.formatToParts(date);
    const map: Record<string, number> = {};
    for (const part of parts) {
      if (part.type !== 'literal') {
        map[part.type] = parseInt(part.value, 10);
      }
    }
    return {
      year: map.year ?? date.getUTCFullYear(),
      month: map.month ?? (date.getUTCMonth() + 1),
      day: map.day ?? date.getUTCDate(),
      hour: (map.hour === 24 ? 0 : map.hour) ?? date.getUTCHours(),
      minute: map.minute ?? date.getUTCMinutes(),
      second: map.second ?? date.getUTCSeconds()
    };
  } catch {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds()
    };
  }
}

export function createDateInTimezone(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  timeZone = 'Asia/Shanghai'
): Date {
  try {
    const utcEstimate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    const parts = getTimeZoneParts(utcEstimate, timeZone);
    const desiredMs = Date.UTC(year, month - 1, day, hour, minute, second);
    const actualMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    return new Date(utcEstimate.getTime() + (desiredMs - actualMs));
  } catch {
    return new Date(year, month - 1, day, hour, minute, second);
  }
}

export function getTrafficPeriod(
  mode: string,
  now: Date,
  startedAt: Date,
  durationDays: number,
  timeZone = 'Asia/Shanghai'
): TrafficPeriod | null {
  if (mode === 'NONE') return null;
  if (mode === 'CALENDAR_MONTH') {
    const parts = getTimeZoneParts(now, timeZone);
    const startAt = createDateInTimezone(parts.year, parts.month, 1, 0, 0, 0, timeZone);
    const nextYear = parts.month === 12 ? parts.year + 1 : parts.year;
    const nextMonth = parts.month === 12 ? 1 : parts.month + 1;
    const nextResetAt = createDateInTimezone(nextYear, nextMonth, 1, 0, 0, 0, timeZone);
    return { startAt, nextResetAt };
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
  durationDays: number,
  timeZone = 'Asia/Shanghai'
): boolean {
  const period = getTrafficPeriod(mode, now, startedAt, durationDays, timeZone);
  return Boolean(period && periodStartAt && periodStartAt.getTime() < period.startAt.getTime());
}
