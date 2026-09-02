import { Activity, GitBranch } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { UserLine } from '@/pages/user/subscription/use-user-subscription';

interface LineCardProps {
  line: UserLine;
  variant?: 'compact' | 'full';
  className?: string;
}

// 统一线路展示卡片（可在我的订阅 compact 概览与可用线路 full 看板中复用）
export function LineCard({ line, variant = 'full', className }: LineCardProps) {
  const isOnline = line.exitNode.status === 'ONLINE';

  if (variant === 'compact') {
    return (
      <div className={cn('rounded-md border p-3.5 space-y-2 bg-card/50 transition-colors hover:bg-muted/20', className)}>
        <div className="flex items-center justify-between gap-2">
          <p className="break-words font-medium text-sm">{line.name}</p>
          <Badge variant="outline" className="text-xs shrink-0">{line.trafficRate}x</Badge>
        </div>
        <p className="break-all font-mono text-xs text-muted-foreground">
          {line.serverHost}:{line.serverPort}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {line.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">#{tag}</Badge>
          ))}
          <Badge variant="outline" className="text-xs">{line.protocolType}</Badge>
          <Badge variant="outline" className="text-xs">{line.type === 'RELAY' ? '中继' : '直连'}</Badge>
          {line.type === 'RELAY' && line.relayMode && (
            <Badge variant="outline" className="text-xs">
              {line.relayMode === 'BLIND_FORWARD' ? '盲转发' : '协议代理'}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground pt-0.5">
          <Activity className="h-3.5 w-3.5 shrink-0" />
          <span>{line.exitNode.name} · 出口 {line.exitPort} · </span>
          <span className={isOnline ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-muted-foreground'}>
            {isOnline ? '在线' : '离线'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <Card className={cn('transition-shadow hover:shadow-xs', className)}>
      <CardHeader className="space-y-2 pb-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base break-words">{line.name}</CardTitle>
          <Badge variant="outline" className="shrink-0">{line.trafficRate}x</Badge>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {line.tags.map((tag) => (
            <Badge key={tag} variant="secondary">#{tag}</Badge>
          ))}
          <Badge variant="outline">{line.protocolType}</Badge>
          <Badge variant="outline">{line.type === 'RELAY' ? '中继' : '直连'}</Badge>
          {line.type === 'RELAY' && line.relayMode && (
            <Badge variant="outline">
              {line.relayMode === 'BLIND_FORWARD' ? '盲转发' : '协议代理'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm pt-0">
        <div className="font-mono text-xs text-muted-foreground">{line.serverHost}:{line.serverPort}</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <GitBranch className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">拓扑：{line.entryNode.name}:{line.entryPort} → {line.exitNode.name}:{line.exitPort}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Activity className="h-3.5 w-3.5 shrink-0" />
          <span className={isOnline ? 'text-emerald-600 dark:text-emerald-400 font-medium' : undefined}>
            {isOnline ? '出口节点在线' : '出口节点离线'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
