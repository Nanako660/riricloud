import * as React from 'react';
import { Legend, Tooltip, type LegendProps } from 'recharts';
import { cn } from '@/lib/utils';

export function ChartContainer({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('w-full min-w-0 [&_.recharts-text]:fill-muted-foreground [&_.recharts-tooltip-wrapper]:!z-50', className)}>{children}</div>;
}

export function ChartTooltip({ wrapperStyle, ...props }: React.ComponentProps<typeof Tooltip>) {
  return <Tooltip wrapperStyle={{ zIndex: 50, pointerEvents: 'none', ...wrapperStyle }} {...props} />;
}

export function ChartIndicator({
  color,
  isDashed = false,
  isLine = false
}: {
  color?: string;
  isDashed?: boolean;
  isLine?: boolean;
}) {
  if (isDashed) {
    return (
      <svg className="h-2.5 w-3.5 shrink-0" viewBox="0 0 14 4" fill="none" aria-hidden="true">
        <line x1="0" y1="2" x2="14" y2="2" stroke={color ?? 'currentColor'} strokeWidth="2" strokeDasharray="3 2" strokeLinecap="round" />
      </svg>
    );
  }
  if (isLine) {
    return (
      <svg className="h-2.5 w-3.5 shrink-0" viewBox="0 0 14 4" fill="none" aria-hidden="true">
        <line x1="0" y1="2" x2="14" y2="2" stroke={color ?? 'currentColor'} strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />;
}

function getSeriesWeight(nameOrKey?: string): number {
  if (!nameOrKey) return 99;
  const str = String(nameOrKey);
  if (str.includes('下行') && (str.includes('平均') || !str.includes('峰值'))) return 1;
  if (str.includes('上行') && (str.includes('平均') || !str.includes('峰值'))) return 2;
  if (str.includes('峰值') && str.includes('下行')) return 3;
  if (str.includes('峰值') && str.includes('上行')) return 4;
  return 99;
}

export function ChartLegendContent(props: {
  payload?: Array<{ value?: string; color?: string; dataKey?: string; strokeDasharray?: string; type?: string }>;
}) {
  const { payload } = props;
  if (!payload?.length) return null;
  const sorted = [...payload].sort((a, b) => getSeriesWeight(a.value ?? String(a.dataKey)) - getSeriesWeight(b.value ?? String(b.dataKey)));

  return (
    <div className="flex flex-wrap items-center justify-center gap-4 text-xs">
      {sorted.map((item) => {
        const isDashed = Boolean(item.strokeDasharray || item.value?.includes('峰值') || item.dataKey?.toString().includes('peak'));
        const isLine = Boolean(isDashed || item.value?.includes('速率') || item.value?.includes('平均') || item.value?.includes('上行') || item.value?.includes('下行'));
        return (
          <div key={item.value} className="flex items-center gap-1.5 text-muted-foreground">
            <ChartIndicator color={item.color} isDashed={isDashed} isLine={isLine} />
            <span>{item.value}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ChartLegend(props: LegendProps) {
  return <Legend content={<ChartLegendContent />} {...props} />;
}

export function ChartTooltipContent({
  active,
  payload,
  label,
  formatter
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string; strokeDasharray?: string }>;
  label?: string;
  formatter?: (value: number, name: string) => string;
}) {
  if (!active || !payload?.length) return null;
  const sorted = [...payload].sort((a, b) => getSeriesWeight(a.name ?? String(a.dataKey)) - getSeriesWeight(b.name ?? String(b.dataKey)));

  return (
    <div className="rounded-lg border bg-background/95 p-3 text-xs shadow-lg backdrop-blur">
      <p className="mb-2 font-medium">{label}</p>
      <div className="space-y-1.5">
        {sorted.map((item) => {
          const isDashed = Boolean(item.strokeDasharray || item.name?.includes('峰值') || item.dataKey?.toString().includes('peak'));
          const isLine = Boolean(isDashed || item.name?.includes('速率') || item.name?.includes('平均') || item.name?.includes('上行') || item.name?.includes('下行'));
          return (
            <div key={item.name} className="flex items-center justify-between gap-6">
              <span className="flex items-center gap-2 text-muted-foreground">
                <ChartIndicator color={item.color} isDashed={isDashed} isLine={isLine} />
                {item.name}
              </span>
              <span className="font-medium tabular-nums">
                {formatter ? formatter(Number(item.value ?? 0), item.name ?? '') : item.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
