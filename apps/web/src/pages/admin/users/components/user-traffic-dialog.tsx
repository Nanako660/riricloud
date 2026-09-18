import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, ArrowDownToLine, ArrowUpFromLine, CalendarClock, Gauge, PackageOpen } from 'lucide-react';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/shared/responsive-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn, formatBytes, formatDate } from '@/lib/utils';
import type { AdminUser } from '../use-users';
import { TrafficDonutChart, TrafficTrendChart } from '../../traffic/components/traffic-charts';
import { TrafficRankTable } from '../../traffic/components/traffic-rank-table';
import { trafficRanges, useUserTrafficDetail, type TrafficTimeRange } from '../../traffic/use-traffic';

type TrafficUser = Pick<AdminUser, 'id' | 'email' | 'role' | 'isActive'>;

export function UserTrafficDialog({
  user,
  open,
  onOpenChange,
  initialRange = 'today'
}: {
  user: TrafficUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRange?: TrafficTimeRange;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const [range, setRange] = React.useState<TrafficTimeRange>(initialRange);
  const { data, isPending, isFetching, isError } = useUserTrafficDetail(user?.id ?? null, range, open);
  const quotaPercent = data && data.quota.trafficLimitBytes > 0 ? Math.min(Math.round((data.quota.trafficUsedBytes / data.quota.trafficLimitBytes) * 100), 100) : 0;

  React.useEffect(() => {
    if (open) setRange(initialRange);
  }, [initialRange, open]);

  const rangeLabels: Record<TrafficTimeRange, string> = {
    today: t('admin:traffic.rangeToday'),
    '24h': t('admin:traffic.range24Hours'),
    '7d': t('admin:traffic.range7Days'),
    '30d': t('admin:traffic.range30Days')
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent size="wide" className="min-w-0 overflow-x-hidden md:max-h-[85vh] md:max-w-5xl">
        <div className="min-w-0 space-y-5">
          <div className="flex min-w-0 flex-col gap-2 pr-8 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold">{t('admin:userTraffic.title')}</h2>
              <p className="truncate text-sm text-muted-foreground">{user?.email ?? t('admin:userTraffic.userFallback')}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Badge variant={user?.role === 'ADMIN' ? 'default' : 'secondary'}>
                {user?.role === 'ADMIN' ? t('admin:userTraffic.roleAdmin') : t('admin:userTraffic.roleUser')}
              </Badge>
              <Badge variant={user?.isActive ? 'outline' : 'destructive'}>
                {user?.isActive ? t('admin:userTraffic.statusActive') : t('admin:userTraffic.statusBanned')}
              </Badge>
            </div>
          </div>
          {isPending && !data ? (
            <div className="space-y-4">
              <Skeleton className="h-32" />
              <div className="grid gap-4 md:grid-cols-2">
                <Skeleton className="h-64" />
                <Skeleton className="h-64" />
              </div>
            </div>
          ) : isError || !data ? (
            <EmptyState title={t('admin:userTraffic.loadErrorTitle')} description={t('admin:userTraffic.loadErrorDesc')} />
          ) : (
            <div className={cn('space-y-5 transition-opacity duration-200', isFetching && 'opacity-85')}>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <PackageOpen className="size-4 text-chart-3" />
                    {t('admin:userTraffic.profileTitle')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 text-sm sm:grid-cols-3">
                  <div>
                    <p className="text-muted-foreground">{t('admin:userTraffic.currentPlan')}</p>
                    <p className="mt-1 font-medium">{data.quota.planName ?? t('admin:userTraffic.noPlan')}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('admin:userTraffic.accountExpire')}</p>
                    <p className="mt-1 flex items-center gap-1 font-medium tabular-nums">
                      <CalendarClock className="size-3.5 text-muted-foreground" />
                      {data.quota.expireAt ? formatDate(data.quota.expireAt) : t('admin:userTraffic.permanent')}
                    </p>
                  </div>
                  <div className="sm:col-span-1">
                    <div className="mb-1 flex justify-between gap-3">
                      <span className="text-muted-foreground">{t('admin:userTraffic.currentUsed')}</span>
                      <span className="tabular-nums">{quotaPercent}%</span>
                    </div>
                    <Progress value={quotaPercent} />
                    <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                      {formatBytes(data.quota.trafficUsedBytes)} / {formatBytes(data.quota.trafficLimitBytes)}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-5">
                  <div className="flex items-center gap-2 text-sm">
                    <ArrowDownToLine className="size-4 text-chart-1" />
                    <span className="text-muted-foreground">{t('admin:userTraffic.periodDownload')}</span>
                    <strong className="tabular-nums">{formatBytes(data.summary.periodDownload)}</strong>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <ArrowUpFromLine className="size-4 text-chart-2" />
                    <span className="text-muted-foreground">{t('admin:userTraffic.periodUpload')}</span>
                    <strong className="tabular-nums">{formatBytes(data.summary.periodUpload)}</strong>
                  </div>
                </div>
                <Tabs value={range} onValueChange={(value) => setRange(value as TrafficTimeRange)}>
                  <TabsList className="h-8 w-full sm:w-auto">
                    {trafficRanges.map((item) => (
                      <TabsTrigger key={item} value={item} className="h-7 flex-1 px-2 text-xs sm:flex-none">
                        {rangeLabels[item]}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>

              {data.summary.periodTotal <= 0 ? (
                <EmptyState title={t('admin:userTraffic.noRecordsTitle')} description={t('admin:userTraffic.noRecordsDesc')} />
              ) : (
                <div className="grid gap-4 lg:grid-cols-3">
                  <Card className="min-w-0 lg:col-span-2">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Activity className="size-4 text-chart-1" />
                        {t('admin:userTraffic.usageTrend')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <TrafficTrendChart data={data.timeSeries} compact />
                    </CardContent>
                  </Card>
                  <Card className="flex min-w-0 flex-col">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Gauge className="size-4 text-chart-4" />
                        {t('admin:userTraffic.lineDistribution')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col pb-4">
                      <TrafficDonutChart data={data.lineBreakdown} />
                    </CardContent>
                  </Card>
                </div>
              )}

              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle className="text-base">{t('admin:userTraffic.lineUsageList')}</CardTitle>
                </CardHeader>
                <CardContent className="min-w-0 overflow-hidden p-0">
                  <div className="min-w-0 overflow-x-auto">
                    <TrafficRankTable items={data.lineBreakdown} compact />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
