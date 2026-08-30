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
import { useUserSubscription, useUserSubscriptionMutations, type UserPlan } from '../subscription/use-user-subscription';

function formatBytes(value: number) { return `${(value / 1024 ** 3).toFixed(value % 1024 ** 3 ? 1 : 0)} GiB`; }

export default function MarketPage() {
  const { data: current } = useUserSubscription();
  const { subscribe, upgrade } = useUserSubscriptionMutations();
  const [selected, setSelected] = useState<UserPlan | null>(null);
  const active = current?.subscription && ['ACTIVE', 'CANCELED'].includes(current.subscription.status);
  const plans = usePlans();
  if (plans.isPending) return <PageContainer><PageHeader title="套餐市场" /><p className="text-sm text-muted-foreground">加载中…</p></PageContainer>;
  if (plans.isError) return <PageContainer><PageHeader title="套餐市场" /><EmptyState title="无法加载套餐" description="请稍后刷新重试" /></PageContainer>;
  return <PageContainer><PageHeader title="套餐市场" description="选择适合你的流量和节点权益。" /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{plans.data?.map((plan) => <Card key={plan.id} className={current?.subscription?.plan.id === plan.id ? 'border-primary' : ''}><CardHeader><div className="flex items-start justify-between gap-3"><CardTitle className="text-lg">{plan.name}</CardTitle>{current?.subscription?.plan.id === plan.id && <Badge>当前套餐</Badge>}</div><p className="text-sm text-muted-foreground">{plan.description || '灵活的代理订阅方案'}</p></CardHeader><CardContent className="space-y-3"><div className="text-3xl font-semibold">{plan.price === 0 ? '免费' : plan.price}<span className="ml-1 text-sm font-normal text-muted-foreground">/ {plan.durationDays} 天</span></div><div className="space-y-2 text-sm"><div className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" />{formatBytes(plan.trafficLimitBytes)} 流量</div><div className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" />按套餐规则自动匹配节点</div><div className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" />支持 Clash / Sing-box 订阅</div></div></CardContent><CardFooter><AlertDialog><AlertDialogTrigger asChild><Button className="w-full" variant={current?.subscription?.plan.id === plan.id ? 'outline' : 'default'} onClick={() => setSelected(plan)} disabled={current?.subscription?.plan.id === plan.id}>{active ? '升配到此套餐' : '立即订购'}</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{active ? '确认升配套餐？' : '确认订购套餐？'}</AlertDialogTitle><AlertDialogDescription>{active ? '新套餐即时生效，已用流量会重置，周期按新套餐重新计算。' : `将订购「${selected?.name}」，支付状态由管理员按当前部署流程处理。`}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => selected && (active ? upgrade.mutate(selected.id) : subscribe.mutate(selected.id))}>确认{active ? '升配' : '订购'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></CardFooter></Card>)}</div>{!plans.data?.length && <EmptyState title="暂无公开套餐" description="请等待管理员上架套餐。" />}<div className="flex items-center gap-2 text-xs text-muted-foreground"><ShoppingBag className="h-4 w-4" />套餐变更会同步到所有在线节点。</div></PageContainer>;
}

function usePlans() {
  return useQuery({ queryKey: ['plans', 'public'], queryFn: async () => (await api.get<UserPlan[]>('/plans/public')).data });
}
