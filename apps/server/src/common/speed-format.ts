export interface SpeedTier {
  maxMbps?: number | null;
  color: string;
}

export const DEFAULT_SPEED_TIERS: SpeedTier[] = [
  { maxMbps: 300, color: 'blue' },
  { maxMbps: 1000, color: 'emerald' },
  { maxMbps: null, color: 'violet' }
];

export const ALLOWED_SPEED_TIER_COLORS = [
  'blue',
  'cyan',
  'emerald',
  'amber',
  'violet',
  'rose'
] as const;

export type SpeedTierColor = typeof ALLOWED_SPEED_TIER_COLORS[number];

/**
 * 格式化速率数值为简写字符串（如 50M, 1G, 2.5G）
 * @param mbps 原始速率（单位 Mbps）
 * @param unitConversion 是否在 >= 1000 Mbps 时自动换算为 G 单位（默认 true）
 */
export function formatSpeedLimit(mbps: number | null | undefined, unitConversion = true): string {
  if (mbps == null || mbps <= 0) {
    return '';
  }

  if (unitConversion && mbps >= 1000) {
    const gigabits = mbps / 1000;
    // 保留最多两位小数并去除末尾多余的 0（如 1G, 1.5G, 2.5G, 10G）
    const formatted = parseFloat(gigabits.toFixed(2));
    return `${formatted}G`;
  }

  return `${mbps}M`;
}

/**
 * 根据速率匹配对应的阶梯颜色名称
 */
export function resolveSpeedTierColor(mbps: number | null | undefined, tiers: SpeedTier[] = DEFAULT_SPEED_TIERS): string {
  if (mbps == null || mbps <= 0) {
    return 'slate';
  }

  // 按 maxMbps 升序排列（null 视为正无穷放最后）
  const sorted = [...(tiers.length > 0 ? tiers : DEFAULT_SPEED_TIERS)].sort((a, b) => {
    if (a.maxMbps == null) return 1;
    if (b.maxMbps == null) return -1;
    return a.maxMbps - b.maxMbps;
  });

  for (const tier of sorted) {
    if (tier.maxMbps == null || tier.maxMbps <= 0 || mbps <= tier.maxMbps) {
      return tier.color || 'blue';
    }
  }

  return sorted[sorted.length - 1]?.color || 'violet';
}
