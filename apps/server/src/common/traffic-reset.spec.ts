import { getTrafficPeriod, shouldResetTraffic } from './traffic-reset';

describe('traffic reset periods', () => {
  it('按指定系统时区（如 UTC / Asia/Shanghai）计算自然月边界并支持跨年', () => {
    const utcDate = new Date('2026-12-31T23:59:59.000Z');
    const periodUtc = getTrafficPeriod('CALENDAR_MONTH', utcDate, utcDate, 30, 'UTC');
    expect(periodUtc).toEqual({
      startAt: new Date('2026-12-01T00:00:00.000Z'),
      nextResetAt: new Date('2027-01-01T00:00:00.000Z')
    });

    const beijingDate = new Date('2026-09-05T12:00:00.000Z');
    const periodBeijing = getTrafficPeriod('CALENDAR_MONTH', beijingDate, beijingDate, 30, 'Asia/Shanghai');
    expect(periodBeijing).toEqual({
      startAt: new Date('2026-08-31T16:00:00.000Z'),
      nextResetAt: new Date('2026-09-30T16:00:00.000Z')
    });
  });

  it('按订阅开始时间每 durationDays 天滚动计算周期', () => {
    const startedAt = new Date('2026-01-31T10:00:00.000Z');
    const now = new Date('2026-03-02T10:00:00.000Z');
    const period = getTrafficPeriod('SUBSCRIPTION_CYCLE', now, startedAt, 30);

    expect(period?.startAt).toEqual(new Date('2026-03-02T10:00:00.000Z'));
    expect(period?.nextResetAt).toEqual(new Date('2026-04-01T10:00:00.000Z'));
  });

  it('订阅尚未开始时保持起点并不提前重置', () => {
    const startedAt = new Date('2026-10-01T00:00:00.000Z');
    const now = new Date('2026-09-03T00:00:00.000Z');
    const period = getTrafficPeriod('SUBSCRIPTION_CYCLE', now, startedAt, 30);

    expect(period?.startAt).toEqual(startedAt);
    expect(shouldResetTraffic('SUBSCRIPTION_CYCLE', startedAt, now, startedAt, 30)).toBe(false);
  });

  it('NONE 和无效周期不产生重置周期', () => {
    const now = new Date('2026-09-03T00:00:00.000Z');
    expect(getTrafficPeriod('NONE', now, now, 30)).toBeNull();
    expect(getTrafficPeriod('SUBSCRIPTION_CYCLE', now, now, 0)).toBeNull();
  });
});
