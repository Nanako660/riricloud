import { Link } from 'react-router-dom';
import {
  CalendarClock,
  ChevronRight,
  Gauge,
  GitBranch,
  HardDrive,
  KeyRound,
  RefreshCw,
  ShoppingBag,
  XCircle
} from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
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
import { useUserSubscription, useUserSubscriptionMutations } from './use-user-subscription';
import { usePublicSettings } from '@/lib/public-settings';
import { formatBytes } from '@/lib/utils';

export default function UserSubscriptionPage() {
  const { data, isPending, isError } = useUserSubscription();
  const { cancel, resetToken } = useUserSubscriptionMutations();
  const publicSettings = usePublicSettings();

  if (isPending) {
    return (
      <PageContainer>
        <PageHeader title="我的订阅" />
        <p className="text-sm text-muted-foreground animate-pulse">加载中…</p>
      </PageContainer>
    );
  }

  if (isError) {
    return (
      <PageContainer>
        <PageHeader title="我的订阅" />
        <EmptyState title="无法加载订阅" description="请稍后刷新重试" />
      </PageContainer>
    );
  }

  if (!data?.subscription) {
    return (
      <PageContainer>
        <PageHeader title="我的订阅" description="管理当前套餐、订阅凭证与授权线路。" />
        <EmptyState
          title="还没有有效订阅"
          description="前往套餐市场选择适合的套餐，开通后将自动生成专属订阅凭证与线路权限。"
          action={
            <Button asChild size="sm">
              <Link to="/market">前往套餐市场</Link>
            </Button>
          }
        />
      </PageContainer>
    );
  }

  const sub = data.subscription;
  const remainingBytes = Math.max(0, sub.trafficLimitBytes - sub.trafficUsedBytes);
  const percent = sub.trafficLimitBytes ? Math.min(100, (sub.trafficUsedBytes / sub.trafficLimitBytes) * 100) : 0;
  const baseUrl = publicSettings.data?.subscriptionBaseUrl?.trim().replace(/\/$/, '') || window.location.origin;
  const url = `${baseUrl}/api/v1/sub/${sub.subscriptionToken}`;

  // 计算剩余有效期
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
    <PageContainer>
      <PageHeader title="我的订阅" description="管理当前套餐、订阅凭证与授权线路。" />

      {/* 卡片 1：当前套餐与用量指标 */}
      <Card>
        <CardHeader className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center pb-4">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-lg sm:text-xl break-words">{sub.plan.name}</CardTitle>
              <Badge variant={sub.status === 'ACTIVE' ? 'default' : 'secondary'} className="shrink-0">
                {sub.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {formatBytes(sub.trafficLimitBytes)} 流量配额 · {sub.plan.durationDays} 天周期 ·{' '}
              {sub.plan.price === 0 ? '免费套餐' : `¥${sub.plan.price}`}
            </p>
          </div>
          <Button asChild size="sm" variant="outline" className="w-full sm:w-auto gap-1.5 shrink-0">
            <Link to="/market">
              <ShoppingBag className="h-4 w-4" />
              升配或变更套餐
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="grid gap-3 sm:grid-cols-3">
            {/* 指标 1：剩余流量 */}
            <div className="rounded-lg border bg-muted/20 p-3.5 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                <HardDrive className="h-3.5 w-3.5 shrink-0" />
                <span>剩余流量</span>
              </div>
              <p className="text-xl font-bold tracking-tight">{formatBytes(remainingBytes)}</p>
              <p className="text-xs text-muted-foreground truncate">
                已用 {formatBytes(sub.trafficUsedBytes)} / 总量 {formatBytes(sub.trafficLimitBytes)}
              </p>
            </div>

            {/* 指标 2：使用率进度 */}
            <div className="rounded-lg border bg-muted/20 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                <div className="flex items-center gap-1.5">
                  <Gauge className="h-3.5 w-3.5 shrink-0" />
                  <span>流量使用率</span>
                </div>
                <span className="font-mono">{percent.toFixed(1)}%</span>
              </div>
              <Progress value={percent} />
              <p className="text-xs text-muted-foreground truncate">
                已消耗 {percent.toFixed(1)}%
              </p>
            </div>

            {/* 指标 3：账户到期 */}
            <div className="rounded-lg border bg-muted/20 p-3.5 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                <span>账户到期</span>
              </div>
              <p className="text-xl font-bold tracking-tight">{daysText}</p>
              <p className="text-xs text-muted-foreground truncate">
                {sub.expireAt ? `到期时间：${expireFormatted}` : '无到期限制'}
              </p>
            </div>
          </div>

          {sub.status === 'ACTIVE' && (
            <div className="flex justify-end pt-1">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    取消当前订阅
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>取消当前订阅？</AlertDialogTitle>
                    <AlertDialogDescription>
                      取消后状态变为 CANCELED，但在到期时间前仍可正常使用代理服务。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>返回</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => cancel.mutate()}>
                      确认取消
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 卡片 2：通用多格式订阅链接 */}
      <Card>
        <CardHeader className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center pb-3">
          <div className="min-w-0 space-y-0.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4" />
              通用多格式订阅链接
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              支持 Clash Meta、Sing-box、Shadowrocket 等多客户端自动解析
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="w-full sm:w-auto gap-1 text-xs shrink-0" disabled={resetToken.isPending}>
                <RefreshCw className="h-3.5 w-3.5" />
                {resetToken.isPending ? '重置中…' : '重置订阅链接'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>重置订阅链接？</AlertDialogTitle>
                <AlertDialogDescription>
                  重置后旧链接立即失效，所有客户端都需要重新导入。建议仅在怀疑链接泄漏时使用。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => resetToken.mutate()}>
                  确认重置
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/50 px-3 py-2 text-xs font-mono">
              {url}
            </code>
            <CopyButton value={url} />
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            将该链接导入支持的代理客户端即可同步所有授权线路；套餐或线路变更时客户端将自动热更新。
          </p>
        </CardContent>
      </Card>

      {/* 卡片 3：可用线路概览 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <GitBranch className="h-4 w-4" />
            可用线路（{data.lines.length}）
          </CardTitle>
          <Button asChild variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground hover:text-foreground">
            <Link to="/lines">
              查看拓扑详情
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {data.lines.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {data.lines.map((line) => (
                <LineCard key={line.id} line={line} variant="compact" />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-4 text-center">当前套餐尚未匹配到可用线路</p>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}


