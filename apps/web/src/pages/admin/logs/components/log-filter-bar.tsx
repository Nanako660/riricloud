import { Download, Radio, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { LogLevel, LogsFilter, LogSource } from '../types';

interface LogFilterBarProps {
  filter: LogsFilter;
  onChange: (patch: Partial<LogsFilter>) => void;
  onRefresh: () => void;
  onOpenCleanup: () => void;
  onExport: (format: 'json' | 'csv') => void;
  isLiveTail: boolean;
  onToggleLiveTail: () => void;
  nodes?: Array<{ id: string; name: string }>;
  isRefreshing: boolean;
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  ALL: 'data-[state=active]:bg-muted data-[state=active]:text-foreground',
  ERROR: 'data-[state=active]:bg-rose-500 data-[state=active]:text-white',
  WARN: 'data-[state=active]:bg-amber-500 data-[state=active]:text-white',
  INFO: 'data-[state=active]:bg-blue-500 data-[state=active]:text-white',
  DEBUG: 'data-[state=active]:bg-slate-500 data-[state=active]:text-white'
};

export function LogFilterBar({
  filter,
  onChange,
  onRefresh,
  onOpenCleanup,
  onExport,
  isLiveTail,
  onToggleLiveTail,
  nodes,
  isRefreshing
}: LogFilterBarProps) {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border bg-card/70 p-3 shadow-2xs backdrop-blur-xs">
      {/* 顶部一排：快速时间范围、级别 Pills、右侧控制动作 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* 时间范围 */}
          <Tabs
            value={filter.timeRange}
            onValueChange={(val) => onChange({ timeRange: val as LogsFilter['timeRange'], page: 1 })}
          >
            <TabsList className="h-8 p-0.5">
              <TabsTrigger value="15m" className="h-7 text-xs px-2.5">15分钟</TabsTrigger>
              <TabsTrigger value="1h" className="h-7 text-xs px-2.5">1小时</TabsTrigger>
              <TabsTrigger value="24h" className="h-7 text-xs px-2.5">24小时</TabsTrigger>
              <TabsTrigger value="7d" className="h-7 text-xs px-2.5">7天</TabsTrigger>
              <TabsTrigger value="all" className="h-7 text-xs px-2.5">全部</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* 日志级别 Pills */}
          <Tabs
            value={filter.level}
            onValueChange={(val) => onChange({ level: val as LogLevel, page: 1 })}
          >
            <TabsList className="h-8 p-0.5">
              {(['ALL', 'ERROR', 'WARN', 'INFO', 'DEBUG'] as LogLevel[]).map((lvl) => (
                <TabsTrigger
                  key={lvl}
                  value={lvl}
                  className={cn('h-7 text-xs px-2.5 font-mono font-medium', LEVEL_COLORS[lvl])}
                >
                  {lvl}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* 右侧主操作区 */}
        <div className="flex items-center gap-1.5 ml-auto">
          {/* Live Tail 实时推流开关 */}
          <Button
            type="button"
            variant={isLiveTail ? 'default' : 'outline'}
            size="sm"
            onClick={onToggleLiveTail}
            className={cn('h-8 gap-1.5 text-xs', isLiveTail && 'bg-emerald-600 hover:bg-emerald-700 text-white')}
          >
            <Radio className={cn('size-3.5', isLiveTail && 'animate-pulse text-white')} />
            {isLiveTail ? '实时推流中' : '实时日志'}
          </Button>

          {/* 刷新 */}
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="size-8"
            title="手动刷新"
          >
            <RefreshCw className={cn('size-3.5', isRefreshing && 'animate-spin')} />
          </Button>

          {/* 导出下拉 */}
          <Select onValueChange={(val) => onExport(val as 'json' | 'csv')}>
            <SelectTrigger className="h-8 w-24 text-xs gap-1">
              <Download className="size-3.5" />
              <span>导出</span>
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="json">JSON 格式</SelectItem>
              <SelectItem value="csv">CSV 表格</SelectItem>
            </SelectContent>
          </Select>

          {/* 清理对话框 */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onOpenCleanup}
            className="size-8 text-destructive hover:bg-destructive/10"
            title="按策略清理旧日志"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* 底部一排：来源端、节点、TraceId、关键词过滤 */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-5">
        {/* 来源端 */}
        <Select
          value={filter.source}
          onValueChange={(val) => onChange({ source: val as LogSource, page: 1 })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="来源端" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">全部来源端</SelectItem>
            <SelectItem value="SERVER">Master 服务端 (API/系统)</SelectItem>
            <SelectItem value="WEB">Web 前端 (JS/异常/事件)</SelectItem>
            <SelectItem value="AGENT">VPS Agent (守护程序)</SelectItem>
            <SelectItem value="SINGBOX">Sing-box (代理内核)</SelectItem>
          </SelectContent>
        </Select>

        {/* 关联节点 */}
        <Select
          value={filter.nodeId}
          onValueChange={(val) => onChange({ nodeId: val, page: 1 })}
        >
          <SelectTrigger className="h-8 text-xs truncate">
            <SelectValue placeholder="筛选节点" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">全部节点</SelectItem>
            {nodes?.map((n) => (
              <SelectItem key={n.id} value={n.id}>
                {n.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* TraceId 精确检索 */}
        <div className="relative">
          <Input
            placeholder="全链路 TraceId..."
            value={filter.traceId}
            onChange={(e) => onChange({ traceId: e.target.value, page: 1 })}
            className="h-8 pr-7 text-xs font-mono"
          />
          {filter.traceId && (
            <button
              type="button"
              onClick={() => onChange({ traceId: '', page: 1 })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        {/* 关键词模糊搜索 */}
        <div className="relative xl:col-span-2">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="全文检索（路由/错误堆栈/IP/模块/消息）..."
            value={filter.keyword}
            onChange={(e) => onChange({ keyword: e.target.value, page: 1 })}
            className="h-8 pl-8 pr-7 text-xs"
          />
          {filter.keyword && (
            <button
              type="button"
              onClick={() => onChange({ keyword: '', page: 1 })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
