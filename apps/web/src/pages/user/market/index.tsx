import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ShoppingBag, ShieldCheck, Zap, Sparkles } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { EmptyState } from '@/components/shared/empty-state';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { api } from '@/lib/api';
import { formatCurrency, cn } from '@/lib/utils';
import { QuickRedeemForm } from '@/components/shared/quick-redeem-form';
import { useWallet } from '@/pages/user/profile/use-profile';
import { useUserSubscription, useUserSubscriptionMutations, type UserPlan } from '../subscription/use-user-subscription';
import { MarketPlanCard } from './components/market-plan-card';

type CycleFilter = 'all' | 'monthly' | 'quarterly' | 'yearly';

export default function MarketPage() {
  const { t } = useTranslation(['user', 'common', 'errors']);
  const { data: current } = useUserSubscription();
  const { subscribe, upgrade } = useUserSubscriptionMutations();
  const wallet = useWallet();
  const [selected, setSelected] = useState<UserPlan | null>(null);
  const [cycle, setCycle] = useState<CycleFilter>('all');
  const active = Boolean(current?.subscription && ['ACTIVE', 'CANCELED'].includes(current.subscription.status));
  const plans = usePlans();

  const planList = useMemo(() => plans.data ?? [], [plans.data]);
  const claimCounts = useMemo(
    () => new Map((current?.planClaims ?? []).map((claim) => [claim.planId, claim.used])),
    [current?.planClaims]
  );

  // 周期筛选过滤
  const filteredPlans = useMemo(() => {
    return planList.filter((plan) => {
      if (cycle === 'monthly') return plan.durationDays <= 31;
      if (cycle === 'quarterly') return plan.durationDays > 31 && plan.durationDays <= 180;
      if (cycle === 'yearly') return plan.durationDays > 180;
      return true;
    });
  }, [planList, cycle]);

  const counts = useMemo(() => {
    return {
      all: planList.length,
      monthly: planList.filter((p) => p.durationDays <= 31).length,
      quarterly: planList.filter((p) => p.durationDays > 31 && p.durationDays <= 180).length,
      yearly: planList.filter((p) => p.durationDays > 180).length
    };
  }, [planList]);

  if (plans.isPending) {
    return (
      <PageContainer>
        <PageHeader title={t('user:market.title')} />
        <div className="flex items-center justify-center py-16">
          <p className="text-sm text-muted-foreground animate-pulse">{t('common:actions.loading')}</p>
        </div>
      </PageContainer>
    );
  }

  if (plans.isError) {
    return (
      <PageContainer>
        <PageHeader title={t('user:market.title')} />
        <EmptyState title={t('common:status.failed')} description={t('errors:network.offline')} />
      </PageContainer>
    );
  }

  const selectedCostCents = Math.round((selected?.price ?? 0) * 100);
  const userBalanceCents = wallet.data?.balance ?? 0;
  const isBalanceInsufficient = selected && userBalanceCents < selectedCostCents;

  return (
    <PageContainer>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <PageHeader
          title={t('user:market.title')}
          description={t('user:market.subtitle')}
        />

        {/* 快捷周期切换器 */}
        {planList.length > 0 && (
          <div className="shrink-0 pb-1">
            <Tabs value={cycle} onValueChange={(val) => setCycle(val as CycleFilter)}>
              <TabsList className="grid grid-cols-4 h-9">
                <TabsTrigger value="all" className="text-xs px-2.5">
                  {t('common:status.all')} ({counts.all})
                </TabsTrigger>
                <TabsTrigger value="monthly" className="text-xs px-2.5">
                  1-30d ({counts.monthly})
                </TabsTrigger>
                <TabsTrigger value="quarterly" className="text-xs px-2.5">
                  31-180d ({counts.quarterly})
                </TabsTrigger>
                <TabsTrigger value="yearly" className="text-xs px-2.5">
                  180d+ ({counts.yearly})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        )}
      </div>

      {/* 用户当前订阅状态精简提示栏 */}
      {current?.subscription && (
        <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary shrink-0" />
            <span>
              {t('user:market.currentPlanTag')}:{' '}
              <strong className="font-semibold text-foreground">
                {current.subscription.plan.name}
              </strong>
              {current.subscription.expireAt && (
                <span className="ml-1 text-[11px]">
                  ({t('user:subscription.expireAt')}: {new Date(current.subscription.expireAt).toLocaleDateString()})
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 text-foreground font-medium">
            <span>{t('user:profile.balance')}：{formatCurrency(userBalanceCents)}</span>
          </div>
        </div>
      )}

      {/* 套餐卡片网格 */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 pt-2">
        {filteredPlans.map((plan) => {
          const isCurrent = active && current?.subscription?.plan.id === plan.id;
          const isLowerPriced = Boolean(
            active &&
              current?.subscription?.plan.price !== undefined &&
              plan.price < current.subscription.plan.price
          );
          const used = claimCounts.get(plan.id) ?? 0;
          const isPurchaseExhausted = plan.purchaseLimitPerUser !== null && used >= plan.purchaseLimitPerUser;

          return (
            <MarketPlanCard
              key={plan.id}
              plan={plan}
              isCurrent={isCurrent}
              isLowerPriced={isLowerPriced}
              isPurchaseExhausted={isPurchaseExhausted}
              activeSubscription={active}
              onSelect={(p) => setSelected(p)}
            />
          );
        })}
      </div>

      {!filteredPlans.length && (
        <EmptyState
          title={t('user:market.emptyPlans')}
          description={cycle === 'all' ? undefined : t('common:table.noResults')}
        />
      )}

      {/* 底部信任说明 */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-primary" />
          <span>{t('user:subscription.linkCardSubtitle')}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            SLA 99.9%
          </span>
          <span className="flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            HA Failover
          </span>
        </div>
      </div>

      {/* 订购 / 升配 确认对话框 */}
      <AlertDialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{active ? t('user:market.confirmUpgradeTitle') : t('user:market.confirmBuyTitle')}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                {selected?.purchaseLimitPerUser !== null &&
                (claimCounts.get(selected?.id ?? '') ?? 0) >= (selected?.purchaseLimitPerUser ?? Number.POSITIVE_INFINITY)
                  ? t('errors:business.freePlanLimitReached')
                  : active
                  ? t('user:market.confirmUpgradeDesc', { price: selected?.price ?? 0, planName: selected?.name ?? '' })
                  : t('user:market.confirmBuyDesc', { price: selected?.price ?? 0, planName: selected?.name ?? '' })}
              </span>
              <span className="block text-xs">
                {t('user:market.balanceAndEstimatedRemaining', { balance: formatCurrency(userBalanceCents) })}
                <strong className={cn('ml-1 font-semibold', userBalanceCents < selectedCostCents ? 'text-destructive' : 'text-foreground')}>
                  {formatCurrency(userBalanceCents - selectedCostCents)}
                </strong>
              </span>
            </AlertDialogDescription>

            {isBalanceInsufficient && (
              <div className="pt-2">
                <p className="text-xs text-destructive mb-2 font-medium">{t('user:market.insufficientBalance')}</p>
                <QuickRedeemForm />
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelected(null)}>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                !selected ||
                wallet.isPending ||
                !wallet.data ||
                isBalanceInsufficient ||
                Boolean(
                  selected &&
                  selected.purchaseLimitPerUser !== null &&
                  (claimCounts.get(selected.id) ?? 0) >= selected.purchaseLimitPerUser
                ) ||
                subscribe.isPending ||
                upgrade.isPending
              }
              onClick={() => {
                if (selected) {
                  if (active) {
                    upgrade.mutate(selected.id, { onSuccess: () => setSelected(null) });
                  } else {
                    subscribe.mutate(selected.id, { onSuccess: () => setSelected(null) });
                  }
                }
              }}
            >
              {subscribe.isPending || upgrade.isPending
                ? t('common:actions.operating')
                : active
                  ? t('user:market.upgradeButton')
                  : t('user:market.buyButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

function usePlans() {
  return useQuery({
    queryKey: ['plans', 'public'],
    queryFn: async () => (await api.get<UserPlan[]>('/plans/public')).data
  });
}
