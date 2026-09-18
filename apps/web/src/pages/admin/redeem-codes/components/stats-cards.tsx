import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/utils';
import type { RedeemCodeStats, RedeemCodeStatus } from '../use-redeem-codes';

export function RedeemStatsCards({ stats, isLoading }: { stats?: RedeemCodeStats; isLoading: boolean }) {
  const { t } = useTranslation(['admin', 'common']);
  const statItems: Array<{ key: RedeemCodeStatus; label: string; valueClass: string }> = [
    { key: 'UNUSED', label: t('admin:redeemCodes.statusUnused'), valueClass: 'text-primary' },
    { key: 'REDEEMED', label: t('admin:redeemCodes.statusRedeemed'), valueClass: 'text-emerald-600 dark:text-emerald-400' },
    { key: 'REVOKED', label: t('admin:redeemCodes.statusRevoked'), valueClass: 'text-destructive' },
    { key: 'EXPIRED', label: t('admin:redeemCodes.statusExpired'), valueClass: 'text-amber-600 dark:text-amber-400' }
  ];

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {statItems.map((item) => {
        const entry = stats?.byStatus[item.key];
        return (
          <div key={item.key} className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            {isLoading && !stats ? (
              <Skeleton className="mt-1 h-8 w-16" />
            ) : (
              <>
                <p className={`mt-1 text-2xl font-semibold tabular-nums ${item.valueClass}`}>{entry?.count ?? 0}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t('admin:redeemCodes.statsTotalAmount', { amount: formatCurrency(entry?.amount ?? 0) })}</p>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
