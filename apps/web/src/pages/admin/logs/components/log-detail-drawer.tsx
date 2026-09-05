import * as React from 'react';
import { AlertCircle, Check, Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { SystemLogItem } from '../types';

interface LogDetailDrawerProps {
  log: SystemLogItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFilterByTraceId: (traceId: string) => void;
}

export function LogDetailDrawer({
  log,
  open,
  onOpenChange,
  onFilterByTraceId
}: LogDetailDrawerProps) {
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  if (!log) return null;

  const copyText = (text: string, key: string, label: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success(`已复制 ${label}`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  let parsedMetadata: Record<string, unknown> = {};
  let parseError = false;
  try {
    parsedMetadata = JSON.parse(log.metadata) as Record<string, unknown>;
  } catch {
    parseError = true;
  }

  const stackTrace = typeof parsedMetadata.errorStack === 'string'
    ? parsedMetadata.errorStack
    : typeof parsedMetadata.stack === 'string'
      ? parsedMetadata.stack
      : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-xl w-full flex flex-col p-6 overflow-hidden">
        <SheetHeader className="pb-3 border-b">
          <SheetTitle className="flex items-center gap-2 text-sm font-semibold">
            <Badge
              variant={log.level === 'ERROR' ? 'destructive' : 'outline'}
              className={cn(
                'font-mono uppercase text-xs',
                log.level === 'WARN' && 'bg-amber-500/10 text-amber-500 border-amber-500/30',
                log.level === 'INFO' && 'bg-blue-500/10 text-blue-500 border-blue-500/30'
              )}
            >
              {log.level}
            </Badge>
            <span>[{log.module}] 日志详情</span>
          </SheetTitle>
          <SheetDescription className="text-xs font-mono text-muted-foreground mt-1">
            产生时间：{new Date(log.createdAt).toLocaleString()} ({new Date(log.createdAt).toISOString()})
          </SheetDescription>
        </SheetHeader>

        {/* 内容滚动区 */}
        <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1 text-xs">
          {/* 全链路 Trace 追踪栏 */}
          {log.traceId ? (
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between text-muted-foreground mb-1.5">
                <span className="font-semibold text-[11px] uppercase tracking-wider">全链路 Trace ID</span>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => copyText(log.traceId!, 'trace', 'Trace ID')}
                    className="h-6 px-2 text-[10px] gap-1"
                  >
                    {copiedKey === 'trace' ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                    复制
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      onFilterByTraceId(log.traceId!);
                      onOpenChange(false);
                    }}
                    className="h-6 px-2 text-[10px] gap-1"
                  >
                    <ExternalLink className="size-3" />
                    按此链路过滤
                  </Button>
                </div>
              </div>
              <div className="font-mono text-xs select-all text-foreground break-all bg-background/80 p-1.5 rounded border">
                {log.traceId}
              </div>
            </div>
          ) : null}

          {/* 基础归属上下文信息 */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border p-2.5 bg-muted/10">
              <div className="text-muted-foreground text-[10px] uppercase font-semibold">来源端</div>
              <div className="mt-1 font-mono font-medium">{log.source}</div>
            </div>
            <div className="rounded-lg border p-2.5 bg-muted/10">
              <div className="text-muted-foreground text-[10px] uppercase font-semibold">所属模块</div>
              <div className="mt-1 font-mono font-medium">{log.module}</div>
            </div>
            {log.node && (
              <div className="rounded-lg border p-2.5 bg-muted/10">
                <div className="text-muted-foreground text-[10px] uppercase font-semibold">关联 VPS 节点</div>
                <div className="mt-1 font-mono font-medium">{log.node.name} ({log.node.serverHost})</div>
              </div>
            )}
            {log.user && (
              <div className="rounded-lg border p-2.5 bg-muted/10">
                <div className="text-muted-foreground text-[10px] uppercase font-semibold">关联操作用户</div>
                <div className="mt-1 font-mono font-medium">{log.user.email}</div>
              </div>
            )}
          </div>

          {/* 日志消息核心正文 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground font-semibold text-[11px] uppercase tracking-wider">日志描述</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => copyText(log.message, 'msg', '日志描述')}
                className="h-6 px-2 text-[10px] gap-1"
              >
                {copiedKey === 'msg' ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                复制
              </Button>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 font-mono text-xs select-text whitespace-pre-wrap break-all leading-relaxed">
              {log.message}
            </div>
          </div>

          {/* 错误堆栈（如果存在） */}
          {stackTrace && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-destructive">
                <div className="flex items-center gap-1">
                  <AlertCircle className="size-3.5" />
                  <span className="font-semibold text-[11px] uppercase tracking-wider">异常调用堆栈 (Stack Trace)</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => copyText(stackTrace, 'stack', '调用堆栈')}
                  className="h-6 px-2 text-[10px] gap-1 text-destructive hover:bg-destructive/10"
                >
                  {copiedKey === 'stack' ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                  复制堆栈
                </Button>
              </div>
              <pre className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 font-mono text-[11px] text-destructive select-text overflow-x-auto leading-relaxed">
                {stackTrace}
              </pre>
            </div>
          )}

          {/* 结构化元数据 JSON */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground font-semibold text-[11px] uppercase tracking-wider">结构化元数据 (JSON Metadata)</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => copyText(JSON.stringify(parsedMetadata, null, 2), 'meta', 'JSON 元数据')}
                className="h-6 px-2 text-[10px] gap-1"
              >
                {copiedKey === 'meta' ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                复制 JSON
              </Button>
            </div>
            <pre className="rounded-lg border bg-zinc-950 text-zinc-100 p-3 font-mono text-[11px] select-text overflow-x-auto leading-relaxed">
              {parseError ? log.metadata : JSON.stringify(parsedMetadata, null, 2)}
            </pre>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
