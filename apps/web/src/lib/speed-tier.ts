export interface SpeedTier {
  maxMbps?: number | null;
  color: string;
}

export const DEFAULT_SPEED_TIERS: SpeedTier[] = [
  { maxMbps: 300, color: 'blue' },
  { maxMbps: 1000, color: 'emerald' },
  { maxMbps: null, color: 'violet' }
];

export interface SpeedColorOption {
  value: string;
  label: string;
  badgeClass: string;
  dotClass: string;
}

export const SPEED_COLOR_OPTIONS: SpeedColorOption[] = [
  {
    value: 'blue',
    label: '科技蓝',
    badgeClass: 'border-blue-500/40 text-blue-600 dark:text-blue-400 bg-blue-500/10',
    dotClass: 'bg-blue-500'
  },
  {
    value: 'cyan',
    label: '极光青',
    badgeClass: 'border-cyan-500/40 text-cyan-600 dark:text-cyan-400 bg-cyan-500/10',
    dotClass: 'bg-cyan-500'
  },
  {
    value: 'emerald',
    label: '翡翠绿',
    badgeClass: 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
    dotClass: 'bg-emerald-500'
  },
  {
    value: 'amber',
    label: '琥珀金',
    badgeClass: 'border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10',
    dotClass: 'bg-amber-500'
  },
  {
    value: 'violet',
    label: '星曜紫',
    badgeClass: 'border-violet-500/40 text-violet-600 dark:text-violet-400 bg-violet-500/10',
    dotClass: 'bg-violet-500'
  },
  {
    value: 'rose',
    label: '玫瑰红',
    badgeClass: 'border-rose-500/40 text-rose-600 dark:text-rose-400 bg-rose-500/10',
    dotClass: 'bg-rose-500'
  }
];

export const DEFAULT_SPEED_COLOR_MAP: Record<string, string> = {
  blue: 'border-blue-500/40 text-blue-600 dark:text-blue-400 bg-blue-500/10',
  cyan: 'border-cyan-500/40 text-cyan-600 dark:text-cyan-400 bg-cyan-500/10',
  emerald: 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
  amber: 'border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10',
  violet: 'border-violet-500/40 text-violet-600 dark:text-violet-400 bg-violet-500/10',
  rose: 'border-rose-500/40 text-rose-600 dark:text-rose-400 bg-rose-500/10'
};

export function formatSpeedLimit(mbps: number | null | undefined, unitConversion = true): string {
  if (mbps == null || mbps <= 0) {
    return '';
  }

  if (unitConversion && mbps >= 1000) {
    const gigabits = mbps / 1000;
    const formatted = parseFloat(gigabits.toFixed(2));
    return `${formatted}G`;
  }

  return `${mbps}M`;
}

export function formatSpeedLimitWithUnit(mbps: number | null | undefined, unitConversion = true): string {
  if (mbps == null || mbps <= 0) {
    return '';
  }

  if (unitConversion && mbps >= 1000) {
    const gigabits = mbps / 1000;
    const formatted = parseFloat(gigabits.toFixed(2));
    return `${formatted} Gbps`;
  }

  return `${mbps} Mbps`;
}

export function getSpeedTierBadgeClass(mbps: number | null | undefined, tiers?: SpeedTier[]): string {
  if (mbps == null || mbps <= 0) {
    return 'border-muted-foreground/30 text-muted-foreground';
  }

  const activeTiers = tiers && tiers.length > 0 ? tiers : DEFAULT_SPEED_TIERS;
  const sorted = [...activeTiers].sort((a, b) => {
    if (a.maxMbps == null) return 1;
    if (b.maxMbps == null) return -1;
    return a.maxMbps - b.maxMbps;
  });

  for (const tier of sorted) {
    if (tier.maxMbps == null || tier.maxMbps <= 0 || mbps <= tier.maxMbps) {
      const color = tier.color || 'blue';
      return DEFAULT_SPEED_COLOR_MAP[color] || DEFAULT_SPEED_COLOR_MAP.blue;
    }
  }

  const fallbackColor = sorted[sorted.length - 1]?.color || 'violet';
  return DEFAULT_SPEED_COLOR_MAP[fallbackColor] || DEFAULT_SPEED_COLOR_MAP.violet;
}
