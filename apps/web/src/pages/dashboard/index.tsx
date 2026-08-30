import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2, Gauge, HardDrive, HelpCircle, Radio, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { api, extractErrorMessage } from '@/lib/api';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { StatCard } from '@/components/shared/stat-card';
import { CopyButton } from '@/components/shared/copy-button';
import { EmptyState } from '@/components/shared/empty-state';
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

// 字节数格式化（与后端 formatBytes 保持一致）
function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(2)} ${units[i]}`;
}

interface DashboardData {
  trafficLimitBytes: number;
  trafficUsedBytes: number;
  expireAt: string | null;
  subscriptionToken: string;
  onlineNodeCount: number;
}

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const dashboard = useQuery({
    queryKey: ['user', 'dashboard'],
    queryFn: async () => (await api.get<DashboardData>('/user/dashboard')).data
  });

  // 重置订阅令牌（破坏性操作，AlertDialog 二次确认）
  const resetSub = useMutation({
    mutationFn: async () =>
      (await api.post<{ subscriptionToken: string }>('/user/reset-sub')).data,
    onSuccess: () => {
      toast.success('订阅链接已重置，请重新导入客户端');
      void queryClient.invalidateQueries({ queryKey: ['user', 'dashboard'] });
    },
    onError: (e) => toast.error(extractErrorMessage(e, '重置失败'))
  });

  if (dashboard.isPending) {
    return (
      <PageContainer>
        <PageHeader title="仪表盘" />
        <div className="text-muted-foreground animate-pulse text-sm">加载中…</div>
      </PageContainer>
    );
  }

  if (dashboard.isError || !dashboard.data) {
    return (
      <PageContainer>
        <PageHeader title="仪表盘" />
        <EmptyState title="无法加载仪表盘数据" description="请稍后刷新重试" />
      </PageContainer>
    );
  }

  const d = dashboard.data;
  const usedPercent =
    d.trafficLimitBytes > 0 ? Number((BigInt(d.trafficUsedBytes) * 100n) / BigInt(d.trafficLimitBytes)) : 0;
  const remaining = d.trafficLimitBytes - d.trafficUsedBytes;
  const subUrl = `${window.location.origin}/api/v1/sub/${d.subscriptionToken}`;

  return (
    <PageContainer>
      <PageHeader title="仪表盘" description="账户配额与订阅概览" />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="剩余流量"
          value={formatBytes(remaining)}
          hint={`总量 ${formatBytes(d.trafficLimitBytes)} · 已用 ${formatBytes(d.trafficUsedBytes)}`}
          icon={<HardDrive className="h-5 w-5" />}
        />
        <StatCard
          title="可用线路"
          value={`${d.onlineNodeCount}`}
          hint="已自动同步至订阅"
          icon={<Radio className="h-5 w-5" />}
        />
        <StatCard
          title="账户有效期"
          value={d.expireAt ? new Date(d.expireAt).toLocaleDateString('zh-CN') : '永久'}
          hint={d.expireAt ? `到期时间 ${new Date(d.expireAt).toLocaleString('zh-CN')}` : '未设置到期时间'}
          icon={<CalendarClock className="h-5 w-5" />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4" />
            流量使用
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Progress value={Math.min(usedPercent, 100)} />
          <p className="text-muted-foreground text-sm">
            已使用 {formatBytes(d.trafficUsedBytes)} / {formatBytes(d.trafficLimitBytes)}（{usedPercent}%）
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" />
            我的订阅
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md border bg-muted/50 px-3 py-2 text-xs font-mono">{subUrl}</code>
            <CopyButton value={subUrl} />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={resetSub.isPending}>
                  {resetSub.isPending ? '重置中…' : '重置链接'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>重置订阅链接？</AlertDialogTitle>
                  <AlertDialogDescription>
                    重置后旧链接立即失效，所有已导入该链接的客户端都需要重新导入新链接。建议仅在怀疑链接泄漏时使用。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => {
                      resetSub.mutate();
                    }}
                  >
                    确认重置
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          <p className="text-muted-foreground text-xs">
            将该链接导入 Clash Meta / Sing-box / Shadowrocket 等客户端即可自动同步所有可用代理线路。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HelpCircle className="h-4 w-4" />
            客户端使用指引
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border p-3.5 space-y-1.5 bg-muted/20">
              <div className="flex items-center gap-2 font-medium text-sm">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">1</span>
                复制订阅链接
              </div>
              <p className="text-muted-foreground text-xs leading-relaxed">
                点击上方“复制”按钮获取您专属的通用多格式订阅链接。
              </p>
            </div>
            <div className="rounded-lg border p-3.5 space-y-1.5 bg-muted/20">
              <div className="flex items-center gap-2 font-medium text-sm">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">2</span>
                导入客户端
              </div>
              <p className="text-muted-foreground text-xs leading-relaxed">
                在 Clash Meta (Mihomo)、Sing-box、Shadowrocket 等客户端中新建配置并粘贴订阅链接。
              </p>
            </div>
            <div className="rounded-lg border p-3.5 space-y-1.5 bg-muted/20">
              <div className="flex items-center gap-2 font-medium text-sm">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">3</span>
                选择线路并连接
              </div>
              <p className="text-muted-foreground text-xs leading-relaxed">
                更新订阅配置后，在客户端选择延迟较低的可用线路开启代理即可开始使用。
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <span>所有公开可用的节点线路将由系统自动同步至客户端，无需手动配置服务器与端口。</span>
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
