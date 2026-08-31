import { Activity, GitBranch } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUserSubscription } from '../subscription/use-user-subscription';

export default function UserLinesPage() {
  const { data, isPending, isError } = useUserSubscription();
  if (isPending) return <PageContainer><PageHeader title="可用线路" /><p className="text-sm text-muted-foreground">加载中…</p></PageContainer>;
  if (isError) return <PageContainer><PageHeader title="可用线路" /><EmptyState title="无法加载线路" description="请稍后刷新重试" /></PageContainer>;
  if (!data?.subscription) return <PageContainer><PageHeader title="可用线路" /><EmptyState title="订阅后查看线路" description="前往套餐市场选择套餐，获取授权的接入线路。" /></PageContainer>;
  return <PageContainer><PageHeader title="可用线路" description="当前套餐授权的接入线路与底层健康状态。" /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.lines.map((line) => <Card key={line.id}><CardHeader className="space-y-2"><div className="flex items-start justify-between gap-3"><CardTitle className="text-base">{line.name}</CardTitle><Badge variant="outline">{line.trafficRate}x</Badge></div><div className="flex flex-wrap gap-1.5">{line.tags.map((tag) => <Badge key={tag} variant="secondary">#{tag}</Badge>)}<Badge variant="outline">{line.protocolType}</Badge><Badge variant="outline">{line.type === 'RELAY' ? '中继' : '直连'}</Badge>{line.type === 'RELAY' && line.relayMode && <Badge variant="outline">{line.relayMode === 'BLIND_FORWARD' ? '盲转发' : '协议代理'}</Badge>}</div></CardHeader><CardContent className="space-y-2 text-sm"><div className="font-mono text-xs">{line.serverHost}:{line.serverPort}</div><div className="flex items-center gap-2 text-muted-foreground"><GitBranch className="h-4 w-4" />拓扑：{line.entryNode.name}:{line.entryPort} → {line.exitNode.name}:{line.exitPort}</div><div className="flex items-center gap-2 text-muted-foreground"><Activity className="h-4 w-4" /><span className={line.exitNode.status === 'ONLINE' ? 'text-emerald-600 dark:text-emerald-400' : undefined}>{line.exitNode.status === 'ONLINE' ? '出口在线' : '出口离线'}</span></div></CardContent></Card>)}</div>{!data.lines.length && <EmptyState title="暂无可用线路" description="当前套餐没有匹配到在线线路。" />}</PageContainer>;
}
