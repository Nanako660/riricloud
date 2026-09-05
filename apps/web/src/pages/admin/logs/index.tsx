import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { api } from '@/lib/api';
import { LogCleanupDialog } from './components/log-cleanup-dialog';
import { LogDetailDrawer } from './components/log-detail-drawer';
import { LogFilterBar } from './components/log-filter-bar';
import { LogLiveTailBar } from './components/log-live-tail-bar';
import { LogMetricsCards } from './components/log-metrics-cards';
import { LogTable } from './components/log-table';
import { LogTrendChart } from './components/log-trend-chart';
import type { LogsFilter, SystemLogItem } from './types';
import { useLiveTailStream, useLogs } from './use-logs';

const DEFAULT_FILTER: LogsFilter = {
  level: 'ALL',
  source: 'ALL',
  nodeId: 'ALL',
  module: '',
  traceId: '',
  keyword: '',
  timeRange: '24h',
  page: 1,
  pageSize: 50
};

export default function AdminLogsPage() {
  const [filter, setFilter] = React.useState<LogsFilter>(DEFAULT_FILTER);
  const [selectedLog, setSelectedLog] = React.useState<SystemLogItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);
  const [isCleanupOpen, setIsCleanupOpen] = React.useState(false);

  // Live Tail 实时推流状态
  const [isLiveTail, setIsLiveTail] = React.useState(false);
  const [isPaused, setIsPaused] = React.useState(false);
  const [autoScroll, setAutoScroll] = React.useState(true);
  const [liveTailBuffer, setLiveTailBuffer] = React.useState<SystemLogItem[]>([]);

  const { logsQuery, metricsQuery, cleanMutation, exportLogs } = useLogs(filter);

  // 获取节点列表供筛选
  const nodesQuery = useQuery({
    queryKey: ['admin-logs-nodes'],
    queryFn: async () => {
      const res = await api.get<Array<{ id: string; name: string }>>('/nodes');
      return res.data;
    }
  });

  // 处理实时日志帧
  const handleNewLiveLog = React.useCallback(
    (item: SystemLogItem) => {
      if (isPaused) return;
      setLiveTailBuffer((prev) => [item, ...prev].slice(0, 500));
    },
    [isPaused]
  );

  const { isConnected } = useLiveTailStream(isLiveTail, filter, handleNewLiveLog);

  const handleFilterChange = (patch: Partial<LogsFilter>) => {
    setFilter((prev) => ({ ...prev, ...patch }));
  };

  const handleSelectLog = (log: SystemLogItem) => {
    setSelectedLog(log);
    setIsDrawerOpen(true);
  };

  const handleFilterByTraceId = (traceId: string) => {
    handleFilterChange({ traceId, page: 1 });
  };

  // 显示数据：推流模式下展示推流缓冲区，否则展示分页数据
  const displayLogs = isLiveTail ? liveTailBuffer : (logsQuery.data?.items ?? []);
  const totalCount = isLiveTail ? liveTailBuffer.length : (logsQuery.data?.total ?? 0);
  const totalPages = isLiveTail ? 1 : (logsQuery.data?.totalPages ?? 1);

  return (
    <PageContainer>
      <PageHeader
        title="系统日志"
        description="全栈全链路可观测中心：统一汇聚 Master 服务端、Web 前端与边缘节点的系统日志与调用堆栈。"
      />

      {/* 顶部指标卡 */}
      <LogMetricsCards
        metrics={metricsQuery.data}
        isLoading={metricsQuery.isPending}
      />

      {/* 24 小时分级趋势图 */}
      <LogTrendChart
        trend={metricsQuery.data?.trend}
        isLoading={metricsQuery.isPending}
      />

      {/* 过滤控制栏 */}
      <LogFilterBar
        filter={filter}
        onChange={handleFilterChange}
        onRefresh={() => void logsQuery.refetch()}
        onOpenCleanup={() => setIsCleanupOpen(true)}
        onExport={exportLogs}
        isLiveTail={isLiveTail}
        onToggleLiveTail={() => {
          setIsLiveTail((prev) => !prev);
          if (!isLiveTail) {
            setLiveTailBuffer([]);
          }
        }}
        nodes={nodesQuery.data}
        isRefreshing={logsQuery.isFetching}
      />

      {/* Live Tail 运行状态条 */}
      {isLiveTail && (
        <LogLiveTailBar
          isConnected={isConnected}
          isPaused={isPaused}
          onTogglePause={() => setIsPaused((prev) => !prev)}
          autoScroll={autoScroll}
          onToggleAutoScroll={setAutoScroll}
          streamCount={liveTailBuffer.length}
          onClearStream={() => setLiveTailBuffer([])}
        />
      )}

      {/* 日志高密度列表 */}
      <LogTable
        logs={displayLogs}
        isLoading={logsQuery.isPending && !isLiveTail}
        total={totalCount}
        page={filter.page}
        pageSize={filter.pageSize}
        totalPages={totalPages}
        onPageChange={(page) => handleFilterChange({ page })}
        onSelectLog={handleSelectLog}
        onFilterByTraceId={handleFilterByTraceId}
      />

      {/* 日志详情侧滑抽屉 */}
      <LogDetailDrawer
        log={selectedLog}
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        onFilterByTraceId={handleFilterByTraceId}
      />

      {/* 日志清理确认模态框 */}
      <LogCleanupDialog
        open={isCleanupOpen}
        onOpenChange={setIsCleanupOpen}
        onClean={async (params) => {
          await cleanMutation.mutateAsync(params);
        }}
        isLoading={cleanMutation.isPending}
      />
    </PageContainer>
  );
}
