import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/utils';
import type { RedeemCodeStats, RedeemCodeStatus } from '../use-redeem-codes';

const STAT_ITEMS: Array<{ key: RedeemCodeStatus; label: string; valueClass: string }> = [
  { key: 'UNUSED', label: '未使用', valueClass: 'text-primary' },
  { key: 'REDEEMED', label: '已兑换', valueClass: 'text-emerald-600 dark:text-emerald-400' },
  { key: 'REVOKED', label: '已作废', valueClass: 'text-destructive' },
  { key: 'EXPIRED', label: '已过期', valueClass: 'text-amber-600 dark:text-amber-400' }
];

export function RedeemStatsCards({ stats, isLoading }: { stats?: RedeemCodeStats; isLoading: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {STAT_ITEMS.map((item) => {
        const entry = stats?.byStatus[item.key];
        return (
          <div key={item.key} className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            {isLoading && !stats ? (
              <Skeleton className="mt-1 h-8 w-16" />
            ) : (
              <>
                <p className={`mt-1 text-2xl font-semibold tabular-nums ${item.valueClass}`}>{entry?.count ?? 0}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">合计 {formatCurrency(entry?.amount ?? 0)}</p>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
