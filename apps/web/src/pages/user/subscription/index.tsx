import { Link } from 'react-router-dom';
import { ChevronRight, GitBranch, RefreshCw, ShoppingBag, XCircle } from 'lucide-react';
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
  const percent = sub.trafficLimitBytes ? Math.min(100, (sub.trafficUsedBytes / sub.trafficLimitBytes) * 100) : 0;
  const baseUrl = publicSettings.data?.subscriptionBaseUrl?.trim().replace(/\/$/, '') || window.location.origin;
  const url = `${baseUrl}/api/v1/sub/${sub.subscriptionToken}`;

  return (
    <PageContainer>
      <PageHeader title="我的订阅" description="管理当前套餐、订阅凭证与授权线路。" />

      <Card>
        <CardHeader className="flex-col items-start justify-between gap-2 space-y-0 sm:flex-row">
          <div className="min-w-0">
            <CardTitle className="break-words text-xl">{sub.plan.name}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatBytes(sub.trafficLimitBytes)} 配额 · {sub.plan.durationDays} 天周期
            </p>
          </div>
          <Badge variant={sub.status === 'ACTIVE' ? 'default' : 'secondary'}>{sub.status}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span>流量使用</span>
              <span className="text-muted-foreground font-mono">
                {formatBytes(sub.trafficUsedBytes)} / {formatBytes(sub.trafficLimitBytes)} ({percent.toFixed(1)}%)
              </span>
            </div>
            <Progress value={percent} />
          </div>

          <div className="grid gap-2 text-xs sm:text-sm text-muted-foreground sm:grid-cols-2 rounded-md bg-muted/20 p-3">
            <span className="break-words">生效时间：{new Date(sub.startedAt).toLocaleString('zh-CN')}</span>
            <span className="break-words">
              到期时间：{sub.expireAt ? new Date(sub.expireAt).toLocaleString('zh-CN') : '永久有效'}
            </span>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">通用多格式订阅链接</p>
            <div className="flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/50 px-3 py-2 text-xs font-mono">
                {url}
              </code>
              <CopyButton value={url} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="w-full sm:w-auto" disabled={resetToken.isPending}>
                  <RefreshCw className="h-4 w-4" />
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
                  <Button variant="ghost" size="sm" className="w-full sm:w-auto text-destructive hover:text-destructive">
                    <XCircle className="h-4 w-4" />
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

            <Button asChild variant="outline" size="sm" className="w-full sm:w-auto ml-auto">
              <Link to="/market">
                <ShoppingBag className="h-4 w-4" />
                升配或变更套餐
              </Link>
            </Button>
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

