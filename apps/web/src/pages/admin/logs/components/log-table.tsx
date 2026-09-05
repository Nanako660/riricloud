import { ChevronLeft, ChevronRight, ExternalLink, HardDrive, Laptop, Server, Terminal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { LogLevel, SystemLogItem } from '../types';

interface LogTableProps {
  logs: SystemLogItem[];
  isLoading: boolean;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  onSelectLog: (log: SystemLogItem) => void;
  onFilterByTraceId?: (traceId: string) => void;
}

const LEVEL_BADGE_VARIANTS: Record<
  LogLevel,
  { variant: 'default' | 'destructive' | 'secondary' | 'outline'; className: string }
> = {
  ALL: { variant: 'outline', className: '' },
  ERROR: { variant: 'destructive', className: 'bg-rose-500/15 text-rose-600 border-rose-500/30 dark:text-rose-400' },
  WARN: { variant: 'outline', className: 'bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400' },
  INFO: { variant: 'outline', className: 'bg-blue-500/15 text-blue-600 border-blue-500/30 dark:text-blue-400' },
  DEBUG: { variant: 'outline', className: 'bg-slate-500/15 text-slate-600 border-slate-500/30 dark:text-slate-400' }
};

const SOURCE_ICONS: Record<string, typeof Server> = {
  SERVER: Server,
  WEB: Laptop,
  AGENT: HardDrive,
  SINGBOX: Terminal
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const padMs = (n: number) => String(n).padStart(3, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${padMs(d.getMilliseconds())}`;
}

export function LogTable({
  logs,
  isLoading,
  total,
  page,
  pageSize: _pageSize,
  totalPages,
  onPageChange,
  onSelectLog,
  onFilterByTraceId
}: LogTableProps) {
  if (isLoading && logs.length === 0) {
    return (
      <div className="space-y-2 rounded-xl border bg-card p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!isLoading && logs.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed bg-card/40 p-6 text-center">
        <Terminal className="size-8 text-muted-foreground/60 mb-2" />
        <p className="text-sm font-medium text-foreground">未检索到匹配的系统日志</p>
        <p className="text-xs text-muted-foreground mt-1">请尝试调整时间范围或放宽过滤条件</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col rounded-xl border bg-card shadow-2xs overflow-hidden">
      {/* 列表头部 */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead className="border-b bg-muted/40 text-muted-foreground">
            <tr>
              <th className="py-2.5 pl-4 pr-2 font-medium w-[160px]">时间</th>
              <th className="py-2.5 px-2 font-medium w-[80px]">级别</th>
              <th className="py-2.5 px-2 font-medium w-[90px]">来源</th>
              <th className="py-2.5 px-2 font-medium w-[110px]">模块</th>
              <th className="py-2.5 px-2 font-medium">日志核心摘要</th>
              <th className="py-2.5 pl-2 pr-4 font-medium text-right w-[140px]">关联 Trace</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {logs.map((log) => {
              const SourceIcon = SOURCE_ICONS[log.source] || Server;
              const lvlConfig = LEVEL_BADGE_VARIANTS[log.level] || LEVEL_BADGE_VARIANTS.INFO;

              return (
                <tr
                  key={log.id}
                  onClick={() => onSelectLog(log)}
                  className="cursor-pointer transition-colors hover:bg-muted/50 group"
                >
                  {/* 时间 */}
                  <td className="py-2 pl-4 pr-2 text-muted-foreground whitespace-nowrap">
                    {formatTime(log.createdAt)}
                  </td>

                  {/* 级别 Badge */}
                  <td className="py-2 px-2 whitespace-nowrap">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase border',
                        lvlConfig.className
                      )}
                    >
                      {log.level}
                    </span>
                  </td>

                  {/* 来源端 */}
                  <td className="py-2 px-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <SourceIcon className="size-3.5" />
                      <span>{log.source}</span>
                    </span>
                  </td>

                  {/* 模块 */}
                  <td className="py-2 px-2 whitespace-nowrap">
                    <span className="text-foreground/80 font-semibold text-[11px] max-w-[100px] truncate block">
                      [{log.module}]
                    </span>
                  </td>

                  {/* 消息正文 */}
                  <td className="py-2 px-2 text-foreground font-sans">
                    <div className="flex items-center gap-2 max-w-xl xl:max-w-2xl">
                      <span className="truncate text-xs font-mono select-text" title={log.message}>
                        {log.message}
                      </span>
                      {log.node && (
                        <Badge variant="outline" className="text-[10px] h-4.5 px-1 font-mono shrink-0">
                          {log.node.name}
                        </Badge>
                      )}
                    </div>
                  </td>

                  {/* TraceId */}
                  <td className="py-2 pl-2 pr-4 text-right whitespace-nowrap font-mono text-[11px]">
                    {log.traceId ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onFilterByTraceId && log.traceId) {
                            onFilterByTraceId(log.traceId);
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-muted/60 hover:bg-primary/10 hover:text-primary transition-colors text-muted-foreground"
                        title={`过滤链路: ${log.traceId}`}
                      >
                        <span className="truncate max-w-[80px]">{log.traceId.slice(0, 8)}...</span>
                        <ExternalLink className="size-2.5 shrink-0 opacity-70" />
                      </button>
                    ) : (
                      <span className="text-muted-foreground/40">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 分页控制栏 */}
      <div className="flex items-center justify-between border-t px-4 py-2.5 bg-card text-xs text-muted-foreground">
        <div>
          共 <span className="font-semibold text-foreground font-mono">{total.toLocaleString()}</span> 条记录
          {totalPages > 1 && (
            <span className="ml-1">（第 {page} / {totalPages} 页）</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="h-7 px-2 text-xs gap-1"
          >
            <ChevronLeft className="size-3.5" />
            <span>上一页</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="h-7 px-2 text-xs gap-1"
          >
            <span>下一页</span>
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
