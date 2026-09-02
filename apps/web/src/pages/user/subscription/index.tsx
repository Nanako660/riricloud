import { Link } from 'react-router-dom';
import { CalendarClock, ChevronRight, GitBranch, HardDrive, RefreshCw, ShoppingBag, XCircle } from 'lucide-react';
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
  const startedFormatted = new Date(sub.startedAt).toLocaleDateString('zh-CN');

  return (
    <PageContainer>
      <PageHeader title="我的订阅" description="管理当前套餐、订阅凭证与授权线路。" />

      <Card>
        <CardHeader className="flex-col items-start justify-between gap-2 space-y-0 sm:flex-row pb-4">
          <div className="min-w-0">
            <CardTitle className="break-words text-xl">{sub.plan.name}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatBytes(sub.trafficLimitBytes)} 配额 · {sub.plan.durationDays} 天周期 ·{' '}
              {sub.plan.price === 0 ? '免费套餐' : `¥${sub.plan.price}`}
            </p>
          </div>
          <Badge variant={sub.status === 'ACTIVE' ? 'default' : 'secondary'} className="shrink-0">
            {sub.status}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-6 pt-0">
          <div className="grid min-w-0 gap-4 lg:grid-cols-12 lg:gap-6">
            {/* 左侧：用量与核心指标画像 */}
            <div className="min-w-0 space-y-3 lg:col-span-7">
              {/* 核心指标双格 */}
              <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3">
                <div className="min-w-0 rounded-lg border bg-muted/20 p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium truncate">
                    <HardDrive className="h-3.5 w-3.5 shrink-0" />
                    <span>剩余流量</span>
                  </div>
                  <p className="text-base sm:text-xl font-bold tracking-tight truncate">{formatBytes(remainingBytes)}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    已用 {formatBytes(sub.trafficUsedBytes)} / 总量 {formatBytes(sub.trafficLimitBytes)}
                  </p>
                </div>

                <div className="min-w-0 rounded-lg border bg-muted/20 p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium truncate">
                    <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                    <span>账户到期</span>
                  </div>
                  <p className="text-base sm:text-xl font-bold tracking-tight truncate">{daysText}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {sub.expireAt ? `到期：${expireFormatted}` : '无到期限制'}
                  </p>
                </div>
              </div>

              {/* 进度条区块 */}
              <div className="min-w-0 space-y-1.5 rounded-lg border bg-muted/10 p-3 sm:p-3.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-medium">流量使用率</span>
                  <span className="font-mono text-muted-foreground font-medium">{percent.toFixed(1)}%</span>
                </div>
                <Progress value={percent} />
                <div className="flex justify-between text-[11px] text-muted-foreground pt-0.5">
                  <span className="truncate">生效于 {startedFormatted}</span>
                  <span className="truncate shrink-0 ml-2">{sub.expireAt ? `截止 ${expireFormatted}` : '长期有效'}</span>
                </div>
              </div>
            </div>

            {/* 右侧：订阅凭据与操作组 */}
            <div className="min-w-0 flex flex-col justify-between space-y-3 rounded-lg border bg-muted/20 p-3.5 sm:p-4 lg:col-span-5">
              <div className="min-w-0 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-foreground truncate">通用多格式订阅链接</p>
                  <span className="text-[10px] text-muted-foreground shrink-0">Clash / Sing-box</span>
                </div>
                <div className="flex min-w-0 items-center gap-1.5 rounded-md border bg-background/80 p-1 pl-2.5">
                  <code className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                    {url}
                  </code>
                  <CopyButton value={url} />
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  将订阅链接导入客户端，将自动获取授权节点并在套餐变更时自动热同步。
                </p>
              </div>

              {/* 操作按钮组 */}
              <div className="space-y-2 pt-2 border-t border-border/60">
                <Button asChild size="sm" className="w-full gap-1.5">
                  <Link to="/market">
                    <ShoppingBag className="h-4 w-4" />
                    升配或变更套餐
                  </Link>
                </Button>

                <div className="grid grid-cols-2 gap-2">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full gap-1 text-xs" disabled={resetToken.isPending}>
                        <RefreshCw className="h-3.5 w-3.5" />
                        {resetToken.isPending ? '重置中…' : '重置链接'}
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

                  {sub.status === 'ACTIVE' && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-1 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          取消订阅
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
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

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

