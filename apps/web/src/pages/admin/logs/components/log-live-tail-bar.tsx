import { useTranslation } from 'react-i18next';
import { ArrowDown, Pause, Play, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface LogLiveTailBarProps {
  isConnected: boolean;
  isPaused: boolean;
  onTogglePause: () => void;
  autoScroll: boolean;
  onToggleAutoScroll: (checked: boolean) => void;
  streamCount: number;
  onClearStream: () => void;
}

export function LogLiveTailBar({
  isConnected,
  isPaused,
  onTogglePause,
  autoScroll,
  onToggleAutoScroll,
  streamCount,
  onClearStream
}: LogLiveTailBarProps) {
  const { t } = useTranslation(['admin', 'common']);

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="relative flex size-2.5">
          <span
            className={cn(
              'absolute inline-flex h-full w-full rounded-full opacity-75',
              isConnected && !isPaused && 'animate-ping bg-emerald-400',
              isPaused && 'bg-amber-400',
              !isConnected && 'bg-rose-400'
            )}
          />
          <span
            className={cn(
              'relative inline-flex size-2.5 rounded-full',
              isConnected && !isPaused && 'bg-emerald-500',
              isPaused && 'bg-amber-500',
              !isConnected && 'bg-rose-500'
            )}
          />
        </span>
        <span className="font-medium text-emerald-800 dark:text-emerald-300">
          {isConnected
            ? (isPaused ? t('admin:logs.streamPaused') : t('admin:logs.streamRunning'))
            : t('admin:logs.streamConnecting')}
        </span>
        <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[10px] text-emerald-700 dark:text-emerald-300">
          {t('admin:logs.streamFrames', { count: streamCount })}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* 自动滚动开关 */}
        <div className="flex items-center gap-1.5">
          <Switch
            id="auto-scroll"
            checked={autoScroll}
            onCheckedChange={onToggleAutoScroll}
            className="scale-75"
          />
          <Label htmlFor="auto-scroll" className="cursor-pointer text-[11px] text-muted-foreground flex items-center gap-0.5">
            <ArrowDown className="size-3" />
            {t('admin:logs.autoScroll')}
          </Label>
        </div>

        {/* 暂停 / 继续按钮 */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onTogglePause}
          className="h-7 text-xs gap-1 border-emerald-500/30 bg-background/80"
        >
          {isPaused ? <Play className="size-3 text-emerald-500" /> : <Pause className="size-3 text-amber-500" />}
          {isPaused ? t('admin:logs.resume') : t('admin:logs.pause')}
        </Button>

        {/* 清屏 */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClearStream}
          className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
        >
          <Trash2 className="size-3" />
          {t('admin:logs.clearScreen')}
        </Button>
      </div>
    </div>
  );
}
