import { useState } from 'react';
import { Pencil, RefreshCw, ShieldAlert } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { EmptyState } from '@/components/shared/empty-state';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useAdminPlans } from '../plans/use-plans';
import { SubscriptionEditDialog } from './components/subscription-edit-dialog';
import { useAdminSubscriptions, useSubscriptionMutations, type AdminSubscription } from './use-subscriptions';

function formatBytes(value: number) { return `${(value / 1024 ** 3).toFixed(1)} GiB`; }
function statusVariant(status: AdminSubscription['status']) { return status === 'ACTIVE' ? 'default' : status === 'REVOKED' ? 'destructive' : 'secondary'; }

export default function AdminSubscriptionsPage() {
  const { data, isPending, isError } = useAdminSubscriptions();
  const { data: plans } = useAdminPlans();
  const { resetToken } = useSubscriptionMutations();
  const [editing, setEditing] = useState<AdminSubscription | null>(null);
  if (isPending) return <PageContainer><PageHeader title="订阅管控" /><p className="text-sm text-muted-foreground">加载中…</p></PageContainer>;
  if (isError) return <PageContainer><PageHeader title="订阅管控" /><EmptyState title="无法加载订阅" description="请稍后刷新重试" /></PageContainer>;
  return <PageContainer><PageHeader title="订阅管控" description="统一查看用户套餐、流量和生命周期状态。" /><div className="grid gap-4">{data?.map((item) => { const percent = item.trafficLimitBytes ? Math.min(100, item.trafficUsedBytes / item.trafficLimitBytes * 100) : 0; return <Card key={item.id}><CardHeader className="flex-row items-start justify-between space-y-0"><div><CardTitle className="text-base">{item.user.email}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{item.plan.name}</p></div><Badge variant={statusVariant(item.status)}>{item.status}</Badge></CardHeader><CardContent className="space-y-3"><div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">流量使用</span><span>{formatBytes(item.trafficUsedBytes)} / {formatBytes(item.trafficLimitBytes)}</span></div><Progress value={percent} /><div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3"><span>开始：{new Date(item.startedAt).toLocaleDateString('zh-CN')}</span><span>到期：{item.expireAt ? new Date(item.expireAt).toLocaleDateString('zh-CN') : '永久'}</span><span>账号：{item.user.isActive ? '正常' : '已禁用'}</span></div><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" size="sm" onClick={() => setEditing(item)}><Pencil />管理</Button><AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="sm"><RefreshCw /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>重置该用户订阅 Token？</AlertDialogTitle><AlertDialogDescription>旧订阅链接会立即失效，用户需要重新导入。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => resetToken.mutate(item.id)}>确认重置</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>{item.status === 'REVOKED' && <ShieldAlert className="h-4 w-4 text-destructive" />}</div></CardContent></Card>; })}</div>{!data?.length && <EmptyState title="暂无订阅" description="用户订购套餐后会出现在这里。" />}<SubscriptionEditDialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)} subscription={editing} plans={plans ?? []} /></PageContainer>;
}
