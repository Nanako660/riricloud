import { cn, formatDateTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface LineLatencyChipProps {
  latencyMs?: number | null;
  status?: string | null;
  message?: string | null;
  testedAt?: string | Date | null;
  className?: string;
}

function formatRelativeTime(dateInput?: string | Date | null): string {
  if (!dateInput) return '未测速';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 30) return '刚刚';
  if (diffSec < 60) return `${diffSec} 秒前`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  return formatDateTime(date, undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: undefined });
}

export function LineLatencyChip({
  latencyMs,
  status,
  message,
  testedAt,
  className
}: LineLatencyChipProps) {
  // 未测速
  if (!status && (latencyMs === null || latencyMs === undefined)) {
    return (
      <Badge
        variant="outline"
        className={cn('inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground select-none', className)}
      >
        <span className="size-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
        <span>— 未测速</span>
      </Badge>
    );
  }

  // 超时
  if (status === 'TIMEOUT') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              'inline-flex items-center gap-1.5 font-mono text-xs border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 cursor-help select-none',
              className
            )}
          >
            <span className="size-1.5 rounded-full bg-rose-500 shrink-0" />
            <span>超时</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs space-y-1 text-xs">
          <p className="font-semibold text-rose-400">测速连接超时</p>
          <p className="text-muted-foreground">时间：{formatRelativeTime(testedAt)}</p>
          {message && <p className="text-xs break-words opacity-80">{message}</p>}
        </TooltipContent>
      </Tooltip>
    );
  }

  // 失败 / 异常
  if (status === 'ERROR') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              'inline-flex items-center gap-1.5 font-mono text-xs border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 cursor-help select-none',
              className
            )}
          >
            <span className="size-1.5 rounded-full bg-rose-500 shrink-0" />
            <span>失败</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs space-y-1 text-xs">
          <p className="font-semibold text-rose-400">测速异常</p>
          <p className="text-muted-foreground">时间：{formatRelativeTime(testedAt)}</p>
          {message && <p className="text-xs break-words opacity-80">{message}</p>}
        </TooltipContent>
      </Tooltip>
    );
  }

  // 成功测得延迟
  const ms = latencyMs ?? 0;
  const isFast = ms < 150;
  const isMedium = ms >= 150 && ms < 400;

  const colorClass = isFast
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
    : isMedium
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
      : 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400';

  const dotClass = isFast
    ? 'bg-emerald-500'
    : isMedium
      ? 'bg-amber-500'
      : 'bg-rose-500';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn(
            'inline-flex items-center gap-1.5 font-mono text-xs cursor-help select-none',
            colorClass,
            className
          )}
        >
          <span className={cn('size-1.5 rounded-full shrink-0', dotClass)} />
          <span>{ms} ms</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs space-y-1 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{ms} ms</span>
          <span className="text-muted-foreground">({isFast ? '延迟极佳' : isMedium ? '延迟一般' : '延迟较高'})</span>
        </div>
        <p className="text-muted-foreground">时间：{formatRelativeTime(testedAt)}</p>
        {message && <p className="text-xs break-words opacity-80">{message}</p>}
      </TooltipContent>
    </Tooltip>
  );
}
