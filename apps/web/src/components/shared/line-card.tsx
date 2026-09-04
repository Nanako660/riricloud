import { Activity } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { LineLatencyChip } from '@/components/shared/line-latency-chip';
import { cn } from '@/lib/utils';
import type { UserLine } from '@/pages/user/subscription/use-user-subscription';

interface LineCardProps {
  line: UserLine;
  className?: string;
}

// 用户只需确认线路名称、协议、倍率、延迟和当前在线状态，拓扑细节由订阅客户端负责展示。
export function LineCard({ line, className }: LineCardProps) {
  const isOnline = line.exitNode.status === 'ONLINE';

  return (
    <div className={cn('flex min-w-0 items-center justify-between gap-3 rounded-md border bg-card/50 p-3 transition-colors hover:bg-muted/20', className)}>
      <div className="min-w-0 space-y-1">
        <p className="truncate text-sm font-medium">{line.name}</p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Badge variant="outline" className="text-xs">{line.protocolType}</Badge>
          <span>协议</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <LineLatencyChip
          latencyMs={line.lastLatencyMs}
          status={line.lastTestStatus}
          message={line.lastTestMessage}
          testedAt={line.lastTestedAt}
        />
        <Badge variant="outline" className="text-xs">{line.trafficRate}x</Badge>
        <Badge variant={isOnline ? 'default' : 'secondary'} className="gap-1 text-xs">
          <Activity className="size-3" />
          {isOnline ? '在线' : '离线'}
        </Badge>
      </div>
    </div>
  );
}
