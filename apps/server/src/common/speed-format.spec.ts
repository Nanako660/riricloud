import {
  formatSpeedLimit,
  resolveSpeedTierColor,
  type SpeedTier
} from './speed-format';

describe('speed-format', () => {
  describe('formatSpeedLimit', () => {
    it('空值或非正数返回空字符串', () => {
      expect(formatSpeedLimit(undefined)).toBe('');
      expect(formatSpeedLimit(null)).toBe('');
      expect(formatSpeedLimit(0)).toBe('');
      expect(formatSpeedLimit(-10)).toBe('');
    });

    it('小于 1000 Mbps 返回 M 单位', () => {
      expect(formatSpeedLimit(50)).toBe('50M');
      expect(formatSpeedLimit(300)).toBe('300M');
      expect(formatSpeedLimit(999)).toBe('999M');
    });

    it('大于等于 1000 Mbps 且开启换算时格式化为 G 单位并去除多余尾零', () => {
      expect(formatSpeedLimit(1000)).toBe('1G');
      expect(formatSpeedLimit(1200)).toBe('1.2G');
      expect(formatSpeedLimit(1500)).toBe('1.5G');
      expect(formatSpeedLimit(2500)).toBe('2.5G');
      expect(formatSpeedLimit(10000)).toBe('10G');
    });

    it('unitConversion 为 false 时即使 >= 1000 仍保留 M 单位', () => {
      expect(formatSpeedLimit(1000, false)).toBe('1000M');
      expect(formatSpeedLimit(2500, false)).toBe('2500M');
    });
  });

  describe('resolveSpeedTierColor', () => {
    it('空值或 0 返回 slate', () => {
      expect(resolveSpeedTierColor(undefined)).toBe('slate');
      expect(resolveSpeedTierColor(0)).toBe('slate');
    });

    it('默认阶梯下正确匹配颜色', () => {
      // DEFAULT_SPEED_TIERS: <=300 blue, <=1000 emerald, >1000 violet
      expect(resolveSpeedTierColor(50)).toBe('blue');
      expect(resolveSpeedTierColor(300)).toBe('blue');
      expect(resolveSpeedTierColor(301)).toBe('emerald');
      expect(resolveSpeedTierColor(1000)).toBe('emerald');
      expect(resolveSpeedTierColor(1001)).toBe('violet');
      expect(resolveSpeedTierColor(2500)).toBe('violet');
    });

    it('支持自定义阶梯规则', () => {
      const customTiers: SpeedTier[] = [
        { maxMbps: 100, color: 'cyan' },
        { maxMbps: 500, color: 'amber' },
        { maxMbps: null, color: 'rose' }
      ];

      expect(resolveSpeedTierColor(80, customTiers)).toBe('cyan');
      expect(resolveSpeedTierColor(200, customTiers)).toBe('amber');
      expect(resolveSpeedTierColor(800, customTiers)).toBe('rose');
    });
  });
});
