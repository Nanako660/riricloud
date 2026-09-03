import { Link } from 'react-router-dom';
import {
  CalendarClock,
  Gauge,
  GitBranch,
  HardDrive,
  KeyRound,
  RefreshCw,
  ShoppingBag,
  XCircle
} from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { AnnouncementCard } from '@/components/shared/announcement-card';
import { ClientGuideCard } from '@/components/shared/client-guide-card';
import { EmptyState } from '@/components/shared/empty-state';
import { CopyButton } from '@/components/shared/copy-button';
import { LineCard } from '@/components/shared/line-card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import {
  type UserLine,
  type UserSubscription,
  useUserSubscription,
  useUserSubscriptionMutations
} from './use-user-subscription';
import { usePublicSettings } from '@/lib/public-settings';
import { formatBytes, formatCurrency } from '@/lib/utils';
import { buildSubscriptionUrl } from '@/lib/subscription-url';
import { QuickRedeemForm } from '@/components/shared/quick-redeem-form';
import { useWallet } from '@/pages/user/profile/use-profile';

export default function UserSubscriptionPage() {
  const { data, isPending, isError } = useUserSubscription();

  if (isPending) {
    return (
      <PageContainer>
        <PageHeader title="我的订阅" />
        <p className="text-sm text-muted-foreground animate-pulse">加载中…</p>
      </PageContainer>
    );
  }

  if (isError || !data) {
    return (
      <PageContainer>
        <PageHeader title="我的订阅" />
        <EmptyState title="无法加载订阅" description="请稍后刷新重试" />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader title="我的订阅" description="管理当前套餐、订阅凭证与可用线路。" />
      <AnnouncementCard />
      {data.subscription ? (
        <ActiveSubscriptionContent subscription={data.subscription} lines={data.lines} />
      ) : (
        <NoSubscriptionCard />
      )}
      <ClientGuideCard />
    </PageContainer>
  );
}

function NoSubscriptionCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShoppingBag className="h-4 w-4" />开通订阅
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-5">
          <div>
            <p className="font-medium">还没有有效订阅</p>
            <p className="mt-1 text-sm text-muted-foreground">选择套餐后，系统会为你生成专属订阅链接和可用线路。</p>
          </div>
          <Button asChild size="sm">
            <Link to="/market">前往套餐市场</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ActiveSubscriptionContent({ subscription: sub, lines }: { subscription: UserSubscription; lines: UserLine[] }) {
  const { cancel, resetToken, renew } = useUserSubscriptionMutations();
  const wallet = useWallet();
  const publicSettings = usePublicSettings();
  const remainingBytes = Math.max(0, sub.trafficLimitBytes - sub.trafficUsedBytes);
  const percent = sub.trafficLimitBytes ? Math.min(100, (sub.trafficUsedBytes / sub.trafficLimitBytes) * 100) : 0;
  const url = buildSubscriptionUrl({
    baseUrl: publicSettings.data?.subscriptionBaseUrl,
    shortLinksEnabled: publicSettings.data?.subscriptionShortLinksEnabled,
    origin: window.location.origin,
    token: sub.subscriptionToken
  });

  let daysText = '永久有效';
  let expireFormatted = '永久有效';
  if (sub.expireAt) {
    const expireDate = new Date(sub.expireAt);
    const now = new Date();
    const diffDays = Math.ceil((expireDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    daysText = diffDays > 0 ? `剩余 ${diffDays} 天` : diffDays === 0 ? '今日到期' : '已过期';
    expireFormatted = expireDate.toLocaleDateString('zh-CN');
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col items-start justify-between gap-3 pb-4 sm:flex-row sm:items-center">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="break-words text-lg sm:text-xl">{sub.plan.name}</CardTitle>
              <Badge variant={sub.status === 'ACTIVE' ? 'default' : 'secondary'} className="shrink-0">
                {sub.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {formatBytes(sub.trafficLimitBytes)} 流量配额 · {sub.plan.durationDays} 天周期 ·{' '}
              {sub.plan.price === 0 ? '免费套餐' : formatCurrency(Math.round(sub.plan.price * 100))}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {['ACTIVE', 'CANCELED'].includes(sub.status) && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="w-full gap-1.5 sm:w-auto" disabled={renew.isPending}>
                    <RefreshCw className="h-4 w-4" />续费此套餐
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>续费当前套餐？</AlertDialogTitle>
                    <AlertDialogDescription>
                      将扣除 {formatCurrency(Math.round(sub.plan.price * 100))}，周期顺延 {sub.plan.durationDays} 天并重置当期流量。
                    </AlertDialogDescription>
                    {wallet.data && wallet.data.balance < Math.round(sub.plan.price * 100) && <QuickRedeemForm />}
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={!wallet.data || wallet.data.balance < Math.round(sub.plan.price * 100) || renew.isPending}
                      onClick={() => renew.mutate()}
                    >
                      确认续费
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button asChild size="sm" variant="outline" className="w-full shrink-0 gap-1.5 sm:w-auto">
              <Link to="/market"><ShoppingBag className="h-4 w-4" />升配或变更套餐</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1 rounded-lg border bg-muted/20 p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <HardDrive className="h-3.5 w-3.5 shrink-0" />
                <span>剩余流量</span>
              </div>
              <p className="text-xl font-bold tracking-tight">{formatBytes(remainingBytes)}</p>
              <p className="truncate text-xs text-muted-foreground">已用 {formatBytes(sub.trafficUsedBytes)} / 总量 {formatBytes(sub.trafficLimitBytes)}</p>
            </div>

            <div className="space-y-2 rounded-lg border bg-muted/20 p-3.5">
              <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Gauge className="h-3.5 w-3.5 shrink-0" />
                  <span>流量使用率</span>
                </div>
                <span className="font-mono">{percent.toFixed(1)}%</span>
              </div>
              <Progress value={percent} />
              <p className="truncate text-xs text-muted-foreground">已消耗 {percent.toFixed(1)}%</p>
            </div>

            <div className="space-y-1 rounded-lg border bg-muted/20 p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                <span>账户到期</span>
              </div>
              <p className="text-xl font-bold tracking-tight">{daysText}</p>
              <p className="truncate text-xs text-muted-foreground">{sub.expireAt ? `到期时间：${expireFormatted}` : '无到期限制'}</p>
            </div>
          </div>

          {sub.status === 'ACTIVE' && (
            <div className="flex justify-end pt-1">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-xs text-destructive hover:bg-destructive/10 hover:text-destructive">
                    <XCircle className="h-3.5 w-3.5" />取消当前订阅
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>取消当前订阅？</AlertDialogTitle>
                    <AlertDialogDescription>取消后状态变为 CANCELED，但在到期时间前仍可正常使用代理服务。</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>返回</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => cancel.mutate()}>确认取消</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col items-start justify-between gap-3 pb-3 sm:flex-row sm:items-center">
          <div className="min-w-0 space-y-0.5">
            <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4" />通用多格式订阅链接</CardTitle>
            <p className="text-xs text-muted-foreground">支持 Clash Meta、Sing-box、Shadowrocket 等多客户端自动解析</p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="w-full shrink-0 gap-1 text-xs sm:w-auto" disabled={resetToken.isPending}>
                <RefreshCw className="h-3.5 w-3.5" />{resetToken.isPending ? '重置中…' : '重置订阅链接'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>重置订阅链接？</AlertDialogTitle>
                <AlertDialogDescription>重置后旧链接立即失效，所有客户端都需要重新导入。建议仅在怀疑链接泄漏时使用。</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => resetToken.mutate()}>确认重置</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/50 px-3 py-2 text-xs font-mono">{url}</code>
            <CopyButton value={url} />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">将该链接导入支持的代理客户端即可同步所有可用线路；套餐或线路变更时客户端将自动热更新。</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><GitBranch className="h-4 w-4" />可用线路（{lines.length}）</CardTitle>
        </CardHeader>
        <CardContent>
          {lines.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {lines.map((line) => <LineCard key={line.id} line={line} />)}
            </div>
          ) : (
            <p className="py-4 text-center text-xs text-muted-foreground">当前套餐尚未匹配到可用线路</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
