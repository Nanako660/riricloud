import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
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
        <PageHeader title="套餐市场" />
        <div className="flex items-center justify-center py-16">
          <p className="text-sm text-muted-foreground animate-pulse">加载套餐市场方案中…</p>
        </div>
      </PageContainer>
    );
  }

  if (plans.isError) {
    return (
      <PageContainer>
        <PageHeader title="套餐市场" />
        <EmptyState title="无法加载套餐" description="网络连接异常或服务暂不可用，请稍后刷新重试" />
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
          title="套餐市场"
          description="挑选符合你网络需求的方案。支持全协议订阅托管、多端自适应与晚高峰极速保障。"
        />

        {/* 快捷周期切换器 */}
        {planList.length > 0 && (
          <div className="shrink-0 pb-1">
            <Tabs value={cycle} onValueChange={(val) => setCycle(val as CycleFilter)}>
              <TabsList className="grid grid-cols-4 h-9">
                <TabsTrigger value="all" className="text-xs px-2.5">
                  全部 ({counts.all})
                </TabsTrigger>
                <TabsTrigger value="monthly" className="text-xs px-2.5">
                  月付 ({counts.monthly})
                </TabsTrigger>
                <TabsTrigger value="quarterly" className="text-xs px-2.5">
                  季/半年 ({counts.quarterly})
                </TabsTrigger>
                <TabsTrigger value="yearly" className="text-xs px-2.5">
                  年付 ({counts.yearly})
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
              当前在用套餐：
              <strong className="font-semibold text-foreground">
                {current.subscription.plan.name}
              </strong>
              {current.subscription.expireAt && (
                <span className="ml-1 text-[11px]">
                  (于 {new Date(current.subscription.expireAt).toLocaleDateString()} 到期)
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 text-foreground font-medium">
            <span>当前余额：{formatCurrency(userBalanceCents)}</span>
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
          title={cycle === 'all' ? '暂无公开套餐' : '该周期下暂无套餐'}
          description={cycle === 'all' ? '请等待管理员上架套餐。' : '可切换至“全部”查看其他周期的方案。'}
        />
      )}

      {/* 底部信任说明 */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-primary" />
          <span>套餐开通或变更后将即时生效，并自动同步至客户端全格式订阅及授权节点。</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            SLA 可用率保障
          </span>
          <span className="flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            多节点负载均衡
          </span>
        </div>
      </div>

      {/* 订购 / 升配 确认对话框 */}
      <AlertDialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{active ? '确认升配套餐？' : '确认订购套餐？'}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                {selected?.purchaseLimitPerUser !== null &&
                (claimCounts.get(selected?.id ?? '') ?? 0) >= (selected?.purchaseLimitPerUser ?? Number.POSITIVE_INFINITY)
                  ? '该套餐已达购买上限，请联系管理员补发。'
                  : active
                  ? `将扣除 ${formatCurrency(selectedCostCents)}，升级至「${selected?.name}」。新套餐即时生效，周期与配额即时重置。`
                  : `将从你的账户余额中扣除 ${formatCurrency(selectedCostCents)} 订购「${selected?.name}」。`}
              </span>
              <span className="block text-xs">
                当前余额：{formatCurrency(userBalanceCents)}；扣款后预计剩余：
                <strong className={cn('ml-1 font-semibold', userBalanceCents < selectedCostCents ? 'text-destructive' : 'text-foreground')}>
                  {formatCurrency(userBalanceCents - selectedCostCents)}
                </strong>
              </span>
            </AlertDialogDescription>

            {isBalanceInsufficient && (
              <div className="pt-2">
                <p className="text-xs text-destructive mb-2 font-medium">当前余额不足，请先兑换卡密或充值：</p>
                <QuickRedeemForm />
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelected(null)}>取消</AlertDialogCancel>
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
                ? '处理中…'
                : active
                  ? '确认升配'
                  : '确认订购'}
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
