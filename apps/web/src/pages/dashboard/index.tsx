import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2, ChevronRight, Gauge, HardDrive, HelpCircle, Megaphone, Radio, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, extractErrorMessage } from '@/lib/api';
import { usePublicSettings } from '@/lib/public-settings';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { StatCard } from '@/components/shared/stat-card';
import { CopyButton } from '@/components/shared/copy-button';
import { EmptyState } from '@/components/shared/empty-state';
import { MarkdownText } from '@/components/shared/markdown-text';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
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

import { formatBytes } from '@/lib/utils';
import { buildSubscriptionUrl } from '@/lib/subscription-url';

interface DashboardData {
  trafficLimitBytes: number;
  trafficUsedBytes: number;
  expireAt: string | null;
  subscriptionToken: string;
  onlineNodeCount: number;
  plan: { id: string; name: string; status: string } | null;
}

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const publicSettings = usePublicSettings();
  const dashboard = useQuery({
    queryKey: ['user', 'dashboard'],
    queryFn: async () => (await api.get<DashboardData>('/user/dashboard')).data,
    refetchInterval: 5000
  });
  const resetSub = useMutation({
    mutationFn: async () => (await api.post<{ subscriptionToken: string }>('/user/reset-sub')).data,
    onSuccess: () => {
      toast.success('订阅链接已重置，请重新导入客户端');
      void queryClient.invalidateQueries({ queryKey: ['user', 'dashboard'] });
    },
    onError: (error) => toast.error(extractErrorMessage(error, '重置失败'))
  });

  if (dashboard.isPending) {
    return <PageContainer><PageHeader title="仪表盘" /><div className="text-muted-foreground animate-pulse text-sm">加载中…</div></PageContainer>;
  }
  if (dashboard.isError || !dashboard.data) {
    return <PageContainer><PageHeader title="仪表盘" /><EmptyState title="无法加载仪表盘数据" description="请稍后刷新重试" /></PageContainer>;
  }

  const data = dashboard.data;
  const usedPercent = data.trafficLimitBytes > 0
    ? Number((BigInt(data.trafficUsedBytes) * 100n) / BigInt(data.trafficLimitBytes))
    : 0;
  const remaining = Math.max(0, data.trafficLimitBytes - data.trafficUsedBytes);
  const subscriptionUrl = buildSubscriptionUrl({
    baseUrl: publicSettings.data?.subscriptionBaseUrl,
    shortLinksEnabled: publicSettings.data?.subscriptionShortLinksEnabled,
    origin: window.location.origin,
    token: data.subscriptionToken
  });

  return (
    <PageContainer>
      <PageHeader title="仪表盘" description="账户配额与订阅概览" />
      <Announcement />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="剩余流量" value={formatBytes(remaining)} hint={`总量 ${formatBytes(data.trafficLimitBytes)} · 已用 ${formatBytes(data.trafficUsedBytes)}`} icon={<HardDrive className="h-5 w-5" />} />
        <StatCard title="可用线路" value={`${data.onlineNodeCount}`} hint="已自动同步至订阅" icon={<Radio className="h-5 w-5" />} />
        <StatCard title="账户有效期" value={data.expireAt ? new Date(data.expireAt).toLocaleDateString('zh-CN') : '永久'} hint={data.expireAt ? `到期时间 ${new Date(data.expireAt).toLocaleString('zh-CN')}` : '未设置到期时间'} icon={<CalendarClock className="h-5 w-5" />} />
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Gauge className="h-4 w-4" />流量使用</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Progress value={Math.min(usedPercent, 100)} />
          <p className="text-muted-foreground text-sm">已使用 {formatBytes(data.trafficUsedBytes)} / {formatBytes(data.trafficLimitBytes)}（{usedPercent}%）</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" />我的订阅
          </CardTitle>
          {data.plan ? (
            <Button asChild variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground hover:text-foreground">
              <Link to="/subscription">
                订阅详情
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {data.plan ? (
            <div className="space-y-3">
              <p className="text-sm">当前套餐：<strong>{data.plan.name}</strong></p>
              <div className="flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/50 px-3 py-2 text-xs font-mono">{subscriptionUrl}</code>
                <CopyButton value={subscriptionUrl} />
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button variant="outline" size="sm" className="w-full sm:w-auto" disabled={resetSub.isPending}>{resetSub.isPending ? '重置中…' : '重置链接'}</Button></AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>重置订阅链接？</AlertDialogTitle><AlertDialogDescription>重置后旧链接立即失效，所有客户端都需要重新导入。建议仅在怀疑链接泄漏时使用。</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => resetSub.mutate()}>确认重置</AlertDialogAction></AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <p className="text-muted-foreground text-xs">将该链接导入 Clash Meta、Sing-box 或 Shadowrocket，即可同步所有可用线路。</p>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-5">
              <div><p className="font-medium">还没有有效订阅</p><p className="text-muted-foreground mt-1 text-sm">选择套餐后，系统会为你生成专属订阅链接和线路权限。</p></div>
              <Button asChild size="sm"><Link to="/market">前往套餐市场</Link></Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><HelpCircle className="h-4 w-4" />客户端使用指引</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ['1', '复制订阅链接', '点击上方复制按钮获取专属的通用多格式订阅链接。'],
              ['2', '导入客户端', '在 Clash Meta、Sing-box 或 Shadowrocket 中粘贴订阅链接。'],
              ['3', '选择线路并连接', '更新配置后选择延迟较低的可用线路开启代理。']
            ].map(([step, title, description]) => (
              <div key={step} className="space-y-1.5 rounded-lg border bg-muted/20 p-3.5">
                <div className="flex items-center gap-2 text-sm font-medium"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{step}</span>{title}</div>
                <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-md bg-secondary/50 px-3 py-2 text-xs text-muted-foreground"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /><span>公开可用的线路会由系统自动同步至客户端，无需手动填写服务器与端口。</span></div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}

function Announcement() {
  const settings = usePublicSettings().data;
  const announcement = settings?.siteAnnouncement?.trim() ?? '';
  const storageKey = useMemo(() => announcement ? `riricloud:announcement:${announcement}` : '', [announcement]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(storageKey ? window.localStorage.getItem(storageKey) === 'dismissed' : false);
  }, [storageKey]);

  if (!announcement || dismissed) return null;
  return (
    <Card className="border-primary/30 bg-primary/[0.04]">
      <CardContent className="flex items-start gap-3 p-4">
        <Megaphone className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1"><MarkdownText content={announcement} /></div>
        <Button variant="ghost" size="icon" className="-mr-2 -mt-2 shrink-0" aria-label="收起公告" onClick={() => { window.localStorage.setItem(storageKey, 'dismissed'); setDismissed(true); }}><X /></Button>
      </CardContent>
    </Card>
  );
}
