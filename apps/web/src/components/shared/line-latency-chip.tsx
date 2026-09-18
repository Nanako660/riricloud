import { useTranslation } from 'react-i18next';
import { cn, formatRelativeTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface LineLatencyChipProps {
  latencyMs?: number | null;
  status?: string | null;
  message?: string | null;
  testedAt?: string | Date | null;
  className?: string;
  onClick?: () => void;
}

export function LineLatencyChip({
  latencyMs,
  status,
  message,
  testedAt,
  className,
  onClick
}: LineLatencyChipProps) {
  const { t } = useTranslation('common');
  const interactiveClass = onClick ? 'cursor-pointer hover:border-primary/50 hover:bg-muted/80 transition-colors' : 'cursor-help';

  // 未测速
  if (!status && (latencyMs === null || latencyMs === undefined)) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            onClick={onClick}
            className={cn('inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground select-none', interactiveClass, className)}
          >
            <span className="size-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
            <span>— {t('latency.notTested')}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs space-y-1 text-xs">
          <p className="font-semibold">{t('latency.notTestedTitle')}</p>
          {onClick && <p className="text-primary text-[11px]">{t('latency.clickToTest')}</p>}
        </TooltipContent>
      </Tooltip>
    );
  }

  // 超时
  if (status === 'TIMEOUT') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            onClick={onClick}
            className={cn(
              'inline-flex items-center gap-1.5 font-mono text-xs border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 select-none',
              interactiveClass,
              className
            )}
          >
            <span className="size-1.5 rounded-full bg-rose-500 shrink-0" />
            <span>{t('latency.timeout')}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs space-y-1 text-xs">
          <p className="font-semibold text-rose-400">{t('latency.timeoutTitle')}</p>
          <p className="text-muted-foreground">{t('latency.testTime', { time: formatRelativeTime(testedAt) })}</p>
          {message && <p className="text-xs break-words opacity-80">{message}</p>}
          {onClick && <p className="text-primary text-[11px] pt-1">{t('latency.clickToDetails')}</p>}
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
            onClick={onClick}
            className={cn(
              'inline-flex items-center gap-1.5 font-mono text-xs border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 select-none',
              interactiveClass,
              className
            )}
          >
            <span className="size-1.5 rounded-full bg-rose-500 shrink-0" />
            <span>{t('latency.failed')}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs space-y-1 text-xs">
          <p className="font-semibold text-rose-400">{t('latency.errorTitle')}</p>
          <p className="text-muted-foreground">{t('latency.testTime', { time: formatRelativeTime(testedAt) })}</p>
          {message && <p className="text-xs break-words opacity-80">{message}</p>}
          {onClick && <p className="text-primary text-[11px] pt-1">{t('latency.clickToDetails')}</p>}
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

  const qualityText = isFast
    ? t('latency.excellent')
    : isMedium
      ? t('latency.normal')
      : t('latency.high');

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          onClick={onClick}
          className={cn(
            'inline-flex items-center gap-1.5 font-mono text-xs select-none',
            colorClass,
            interactiveClass,
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
          <span className="text-muted-foreground">({qualityText})</span>
        </div>
        <p className="text-muted-foreground">{t('latency.testTime', { time: formatRelativeTime(testedAt) })}</p>
        {message && <p className="text-xs break-words opacity-80">{message}</p>}
        {onClick && <p className="text-primary text-[11px] pt-1">{t('latency.clickToTest')}</p>}
      </TooltipContent>
    </Tooltip>
  );
}
