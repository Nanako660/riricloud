import * as React from 'react';
import { useTranslation } from 'react-i18next';
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
  onFilterByNodeId?: (nodeId: string) => void;
  onFilterByModule?: (module: string) => void;
  keyword?: string;
}

function highlightKeyword(text: string, keyword?: string): React.ReactNode {
  if (!keyword || !keyword.trim()) return text;
  const kw = keyword.trim();
  const lowerText = text.toLowerCase();
  const lowerKw = kw.toLowerCase();
  if (!lowerText.includes(lowerKw)) return text;

  const nodes: React.ReactNode[] = [];
  let start = 0;
  let idx = lowerText.indexOf(lowerKw, start);

  while (idx !== -1) {
    if (idx > start) {
      nodes.push(text.slice(start, idx));
    }
    nodes.push(
      <mark
        key={idx}
        className="rounded bg-amber-500/25 px-0.5 font-bold text-amber-900 dark:text-amber-200"
      >
        {text.slice(idx, idx + kw.length)}
      </mark>
    );
    start = idx + kw.length;
    idx = lowerText.indexOf(lowerKw, start);
  }

  if (start < text.length) {
    nodes.push(text.slice(start));
  }

  return nodes;
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

function getRepeatCount(metadata: string | undefined): number {
  if (!metadata) return 1;
  try {
    const parsed = JSON.parse(metadata) as { repeatCount?: unknown };
    return typeof parsed.repeatCount === 'number' && Number.isFinite(parsed.repeatCount) && parsed.repeatCount > 1
      ? Math.floor(parsed.repeatCount)
      : 1;
  } catch {
    return 1;
  }
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
  onFilterByTraceId,
  onFilterByNodeId,
  onFilterByModule,
  keyword
}: LogTableProps) {
  const { t } = useTranslation(['admin', 'common']);

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
        <p className="text-sm font-medium text-foreground">{t('admin:logs.emptySearchTitle')}</p>
        <p className="text-xs text-muted-foreground mt-1">{t('admin:logs.emptySearchDesc')}</p>
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
              <th className="py-2.5 pl-4 pr-2 font-medium w-[160px]">{t('admin:logs.colTime')}</th>
              <th className="py-2.5 px-2 font-medium w-[80px]">{t('admin:logs.colLevel')}</th>
              <th className="py-2.5 px-2 font-medium w-[90px]">{t('admin:logs.colSource')}</th>
              <th className="py-2.5 px-2 font-medium w-[110px]">{t('admin:logs.colModule')}</th>
              <th className="py-2.5 px-2 font-medium">{t('admin:logs.colMessage')}</th>
              <th className="py-2.5 pl-2 pr-4 font-medium text-right w-[140px]">{t('admin:logs.colTrace')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {logs.map((log) => {
              const SourceIcon = SOURCE_ICONS[log.source] || Server;
              const lvlConfig = LEVEL_BADGE_VARIANTS[log.level] || LEVEL_BADGE_VARIANTS.INFO;
              const repeatCount = getRepeatCount(log.metadata);

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
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onFilterByModule?.(log.module);
                      }}
                      className="text-foreground/80 hover:text-primary hover:underline font-semibold text-[11px] max-w-[100px] truncate block text-left transition-colors cursor-pointer"
                      title={t('admin:logs.filterByModuleTitle', { module: log.module })}
                    >
                      [{log.module}]
                    </button>
                  </td>

                  {/* 消息正文 */}
                  <td className="py-2 px-2 text-foreground font-sans">
                    <div className="flex items-center gap-2 max-w-xl xl:max-w-2xl">
                      <span className="truncate text-xs font-mono select-text" title={log.message}>
                        {highlightKeyword(log.message, keyword)}
                      </span>
                      {repeatCount > 1 && (
                        <Badge variant="secondary" className="h-4.5 shrink-0 px-1 font-mono text-[10px]" title={t('admin:logs.repeatCountTitle', { count: repeatCount })}>
                          x{repeatCount}
                        </Badge>
                      )}
                      {log.node && (
                        <Badge
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (log.node?.id) {
                              onFilterByNodeId?.(log.node.id);
                            }
                          }}
                          className="text-[10px] h-4.5 px-1 font-mono shrink-0 cursor-pointer hover:border-primary hover:text-primary transition-colors"
                          title={t('admin:logs.filterByNodeTitle', { name: log.node.name })}
                        >
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
                        title={t('admin:logs.filterByTraceTitle', { traceId: log.traceId })}
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
          <span>{t('admin:logs.totalRecords', { count: total })}</span>
          {totalPages > 1 && (
            <span className="ml-1">{t('admin:logs.pageNumber', { current: page, total: totalPages })}</span>
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
            <span>{t('common:table.previous')}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="h-7 px-2 text-xs gap-1"
          >
            <span>{t('common:table.next')}</span>
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
