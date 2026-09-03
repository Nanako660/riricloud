import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ShoppingBag } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { api } from '@/lib/api';
import { formatBytes } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import { QuickRedeemForm } from '@/components/shared/quick-redeem-form';
import { useWallet } from '@/pages/user/profile/use-profile';
import { useUserSubscription, useUserSubscriptionMutations, type UserPlan } from '../subscription/use-user-subscription';

const resetLabels = { NONE: '不自动重置', CALENDAR_MONTH: '自然月重置', SUBSCRIPTION_CYCLE: '订阅周期重置' } as const;

export default function MarketPage() {
  const { data: current } = useUserSubscription();
  const { subscribe, upgrade } = useUserSubscriptionMutations();
  const wallet = useWallet();
  const [selected, setSelected] = useState<UserPlan | null>(null);
  const active = current?.subscription && ['ACTIVE', 'CANCELED'].includes(current.subscription.status);
  const plans = usePlans();

  if (plans.isPending) {
    return (
      <PageContainer>
        <PageHeader title="套餐市场" />
        <p className="text-sm text-muted-foreground animate-pulse">加载中…</p>
      </PageContainer>
    );
  }

  if (plans.isError) {
    return (
      <PageContainer>
        <PageHeader title="套餐市场" />
        <EmptyState title="无法加载套餐" description="请稍后刷新重试" />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader title="套餐市场" description="选择适合你的流量和节点权益。" />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.data?.map((plan) => (
          (() => {
            const isCurrent = current?.subscription?.plan.id === plan.id;
            const isLowerPriced = Boolean(active && current?.subscription?.plan.price !== undefined && plan.price < current.subscription.plan.price);
            return (
          <Card
            key={plan.id}
            className={isCurrent ? 'border-primary ring-1 ring-primary/20' : ''}
          >
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-lg">{plan.name}</CardTitle>
                {isCurrent && <Badge>当前套餐</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">{plan.description || '灵活的代理订阅方案'}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-3xl font-semibold">
                {plan.price === 0 ? '免费' : formatCurrency(Math.round(plan.price * 100))}
                <span className="ml-1 text-sm font-normal text-muted-foreground">/ {plan.durationDays} 天</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>{formatBytes(plan.trafficLimitBytes)} 流量配额</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>流量：{resetLabels[plan.trafficResetMode]}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>按套餐规则自动匹配授权节点</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>支持 Clash Meta / Sing-box 等多格式订阅</span>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    className="w-full"
                    variant={isCurrent || isLowerPriced ? 'outline' : 'default'}
                    onClick={() => setSelected(plan)}
                    disabled={isCurrent || isLowerPriced}
                  >
                    {isCurrent
                      ? '使用中'
                      : isLowerPriced
                        ? '暂不支持降级'
                      : active
                        ? '升配到此套餐'
                        : '立即订购'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{active ? '确认升配套餐？' : '确认订购套餐？'}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {active
                        ? `将扣除 ${formatCurrency(Math.round((selected?.price ?? 0) * 100))}，新套餐即时生效，已用流量会重置。`
                        : `将扣除 ${formatCurrency(Math.round((selected?.price ?? 0) * 100))} 订购「${selected?.name}」。`}
                      <span className="mt-2 block">当前余额：{formatCurrency(wallet.data?.balance)}；扣款后余额：{formatCurrency((wallet.data?.balance ?? 0) - Math.round((selected?.price ?? 0) * 100))}</span>
                    </AlertDialogDescription>
                    {selected && wallet.data && wallet.data.balance < Math.round(selected.price * 100) && <QuickRedeemForm />}
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={!selected || wallet.isPending || !wallet.data || wallet.data.balance < Math.round(selected.price * 100) || subscribe.isPending || upgrade.isPending}
                      onClick={() => selected && (active ? upgrade.mutate(selected.id) : subscribe.mutate(selected.id))}
                    >
                      确认{active ? '升配' : '订购'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardFooter>
            {isLowerPriced && <p className="px-6 pb-6 text-xs text-muted-foreground">目标套餐价格低于当前套餐，暂不支持直接降级。</p>}
          </Card>
            );
          })()
        ))}
      </div>

      {!plans.data?.length && <EmptyState title="暂无公开套餐" description="请等待管理员上架套餐。" />}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShoppingBag className="h-4 w-4" />
        <span>套餐变更会自动同步更新至客户端订阅与所有在线节点。</span>
      </div>
    </PageContainer>
  );
}

function usePlans() {
  return useQuery({ queryKey: ['plans', 'public'], queryFn: async () => (await api.get<UserPlan[]>('/plans/public')).data });
}
