import * as React from 'react';
import { Activity, ArrowDownToLine, ArrowUpFromLine, Gauge, Users, Zap } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatCard } from '@/components/shared/stat-card';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { EmptyState } from '@/components/shared/empty-state';
import { cn, formatBytes, formatRate } from '@/lib/utils';
import { RateTrendChart, TrafficDonutChart, TrafficTrendChart } from './components/traffic-charts';
import { TrafficRankTable } from './components/traffic-rank-table';
import { UserRankTable } from './components/user-rank-table';
import { UserTrafficDialog } from '../users/components/user-traffic-dialog';
import { trafficRangeLabels, trafficRanges, useTrafficOverview, type TrafficTimeRange, type UserTrafficRankItem } from './use-traffic';

function TrafficSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }, (_, index) => <Skeleton key={index} className="h-24" />)}
      </div>
      <Skeleton className="h-96" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-96 lg:col-span-2" />
        <Skeleton className="h-96" />
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

export default function AdminTrafficPage() {
  const [range, setRange] = React.useState<TrafficTimeRange>('today');
  const [lineSearch, setLineSearch] = React.useState('');
  const [protocolFilter, setProtocolFilter] = React.useState('ALL');
  const [donutMode, setDonutMode] = React.useState<'lines' | 'users'>('lines');
  const [detailMode, setDetailMode] = React.useState<'lines' | 'users'>('lines');
  const [trafficUser, setTrafficUser] = React.useState<UserTrafficRankItem | null>(null);
  const { data, isPending, isFetching, isError } = useTrafficOverview(range);
  const summary = data?.summary;
  const protocols = Array.from(new Set((data?.lineRankings ?? []).map((item) => item.protocolType).filter((value): value is string => Boolean(value))));
  const lineRankings = data?.lineRankings.filter((item) =>
    item.lineName.toLowerCase().includes(lineSearch.trim().toLowerCase()) &&
    (protocolFilter === 'ALL' || item.protocolType === protocolFilter)
  ) ?? [];

  return (
    <PageContainer>
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader title="流量统计" description="查看节点网络吞吐、线路用量分布与计费排行榜。" />
        <Tabs value={range} onValueChange={(value) => setRange(value as TrafficTimeRange)}>
          <TabsList className="h-8 w-full sm:w-auto"><span className="sr-only">时间范围</span>{trafficRanges.map((item) => <TabsTrigger key={item} value={item} className="h-7 flex-1 px-2 text-xs sm:flex-none">{trafficRangeLabels[item]}</TabsTrigger>)}</TabsList>
        </Tabs>
      </div>

      {isPending && !data ? <TrafficSkeleton /> : isError || !data || !summary || !data.rate ? <EmptyState title="无法加载流量统计" description="请稍后刷新重试" /> : (
        <div className={cn('space-y-4 transition-opacity duration-200', isFetching && 'opacity-85')}>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
            <StatCard title="总计费流量" value={formatBytes(summary.totalBilled)} hint={`物理流量 ${formatBytes(summary.totalPhysical)}`} icon={<Zap className="size-5 text-chart-3" />} />
            <StatCard title="总下行流量" value={formatBytes(summary.totalDownload)} icon={<ArrowDownToLine className="size-5 text-chart-1" />} />
            <StatCard title="总上行流量" value={formatBytes(summary.totalUpload)} icon={<ArrowUpFromLine className="size-5 text-chart-2" />} />
            <StatCard title="当前下行速率" value={formatRate(data.rate.currentDownloadRate)} hint="在线节点网络吞吐" icon={<ArrowDownToLine className="size-5 text-chart-1" />} />
            <StatCard title="当前上行速率" value={formatRate(data.rate.currentUploadRate)} hint="在线节点网络吞吐" icon={<ArrowUpFromLine className="size-5 text-chart-2" />} />
            <StatCard title="活跃线路" value={`${summary.activeLinesCount} / ${summary.totalLinesCount}`} hint="产生流量的线路" icon={<Activity className="size-5 text-chart-4" />} />
            <StatCard title="活跃用户" value={`${summary.activeUsersCount} / ${summary.totalUsersCount}`} hint="产生流量的用户" icon={<Users className="size-5 text-chart-5" />} />
          </div>

          <Card className="min-w-0"><CardHeader><CardTitle>历史上下行速率</CardTitle><CardDescription>节点网络吞吐走势（实线为平均速率，虚线为峰值参考，单位 bytes/s；不参与计费）。</CardDescription></CardHeader><CardContent><RateTrendChart data={data.rateSeries} /><div className="grid gap-3 border-t pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-muted-foreground">平均上行</p><p className="mt-1 font-semibold tabular-nums">{formatRate(data.rate.averageUploadRate)}</p></div><div><p className="text-muted-foreground">平均下行</p><p className="mt-1 font-semibold tabular-nums">{formatRate(data.rate.averageDownloadRate)}</p></div><div><p className="text-muted-foreground">近似峰值上行</p><p className="mt-1 font-semibold tabular-nums">{formatRate(data.rate.peakUploadRate)}</p></div><div><p className="text-muted-foreground">近似峰值下行</p><p className="mt-1 font-semibold tabular-nums">{formatRate(data.rate.peakDownloadRate)}</p></div></div></CardContent></Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="flex min-w-0 flex-col lg:col-span-2"><CardHeader><CardTitle>时序吞吐走势</CardTitle><CardDescription>按{data.bucketType === 'hour' ? '小时' : '天'}汇总原始上行与下行流量</CardDescription></CardHeader><CardContent className="flex flex-1 flex-col pb-2"><TrafficTrendChart data={data.timeSeries} /></CardContent></Card>
            <Card className="flex min-w-0 flex-col">
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>消耗占比</CardTitle>
                    <CardDescription>{donutMode === 'lines' ? '按物理流量统计线路分布' : '展示 Top 5 用户与其他用户的物理流量占比'}</CardDescription>
                  </div>
                  <Tabs value={donutMode} onValueChange={(value) => setDonutMode(value as 'lines' | 'users')}>
                    <TabsList className="h-8 w-full sm:w-auto">
                      <TabsTrigger value="lines" className="h-7 flex-1 px-2 text-xs sm:flex-none"><Activity className="mr-1 size-3.5" />线路</TabsTrigger>
                      <TabsTrigger value="users" className="h-7 flex-1 px-2 text-xs sm:flex-none"><Users className="mr-1 size-3.5" />用户</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col pb-4">
                <TrafficDonutChart
                  data={donutMode === 'lines' ? data.lineRankings : data.userRankings}
                  mode={donutMode === 'lines' ? 'line' : 'user'}
                  totalPhysical={summary.totalPhysical}
                />
              </CardContent>
            </Card>
          </div>

          <Card className="min-w-0">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>消耗明细</CardTitle>
                  <CardDescription>{detailMode === 'lines' ? '原始流量与倍率折算后的计费量对比' : '按周期物理流量排序的活跃用户 Top 100'}</CardDescription>
                </div>
                <Tabs value={detailMode} onValueChange={(value) => setDetailMode(value as 'lines' | 'users')}>
                  <TabsList className="h-8 w-full sm:w-auto">
                    <TabsTrigger value="lines" className="h-7 flex-1 px-2 text-xs sm:flex-none">线路明细</TabsTrigger>
                    <TabsTrigger value="users" className="h-7 flex-1 px-2 text-xs sm:flex-none">用户排行</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {detailMode === 'lines' ? (
                <div>
                  <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-end">
                    <div className="flex flex-wrap items-center gap-2">
                      <Gauge className="size-4 text-muted-foreground" />
                      <Input aria-label="搜索线路" className="h-9 w-full sm:w-56" placeholder="搜索线路…" value={lineSearch} onChange={(event) => setLineSearch(event.target.value)} />
                      <Select value={protocolFilter} onValueChange={setProtocolFilter}>
                        <SelectTrigger aria-label="筛选线路协议" className="h-9 w-full sm:w-36"><SelectValue placeholder="协议" /></SelectTrigger>
                        <SelectContent><SelectItem value="ALL">全部协议</SelectItem>{protocols.map((protocol) => <SelectItem key={protocol} value={protocol}>{protocol}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <TrafficRankTable items={lineRankings} />
                </div>
              ) : <UserRankTable items={data.userRankings} onSelectUser={setTrafficUser} />}
            </CardContent>
          </Card>
          <UserTrafficDialog
            user={trafficUser ? { id: trafficUser.userId, email: trafficUser.email, role: trafficUser.role as 'ADMIN' | 'USER', isActive: trafficUser.isActive } : null}
            open={!!trafficUser}
            initialRange={range}
            onOpenChange={(open) => !open && setTrafficUser(null)}
          />
        </div>
      )}
    </PageContainer>
  );
}
