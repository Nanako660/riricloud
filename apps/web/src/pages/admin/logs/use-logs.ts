import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, extractErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import type { LogMetrics, LogsFilter, LogsQueryResult, SystemLogItem } from './types';

function computeTimeRangeFilter(range: LogsFilter['timeRange']) {
  if (range === 'all') return {};
  const now = Date.now();
  let ms = 24 * 60 * 60 * 1000;
  if (range === '15m') ms = 15 * 60 * 1000;
  else if (range === '1h') ms = 60 * 60 * 1000;
  else if (range === '24h') ms = 24 * 60 * 60 * 1000;
  else if (range === '7d') ms = 7 * 24 * 60 * 60 * 1000;

  return {
    startTime: new Date(now - ms).toISOString()
  };
}

export function useLogs(filter: LogsFilter) {
  const queryClient = useQueryClient();

  // 1. 分页与多维过滤查询
  const logsQuery = useQuery({
    queryKey: ['admin-logs', filter],
    queryFn: async () => {
      const timeParams = computeTimeRangeFilter(filter.timeRange);
      const params: Record<string, string | number | undefined> = {
        page: filter.page,
        pageSize: filter.pageSize,
        ...timeParams
      };

      if (filter.level !== 'ALL') params.level = filter.level;
      if (filter.source !== 'ALL') params.source = filter.source;
      if (filter.nodeId && filter.nodeId !== 'ALL') params.nodeId = filter.nodeId;
      if (filter.module) params.module = filter.module.trim();
      if (filter.traceId) params.traceId = filter.traceId.trim();
      if (filter.keyword) params.keyword = filter.keyword.trim();

      const res = await api.get<LogsQueryResult>('/logs', { params });
      return res.data;
    }
  });

  // 2. 指标卡与趋势图查询
  const metricsQuery = useQuery({
    queryKey: ['admin-logs-metrics'],
    queryFn: async () => {
      const res = await api.get<LogMetrics>('/logs/metrics', { params: { hours: 24 } });
      return res.data;
    },
    refetchInterval: 30_000
  });

  // 3. 清理日志 mutation
  const cleanMutation = useMutation({
    mutationFn: async ({ retentionDays, maxRecords }: { retentionDays?: number; maxRecords?: number }) => {
      const params: Record<string, number> = {};
      if (retentionDays !== undefined) params.retentionDays = retentionDays;
      if (maxRecords !== undefined) params.maxRecords = maxRecords;
      const res = await api.delete<{ deletedCount: number }>('/logs', { params });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(`清理完成，共清除 ${data.deletedCount} 条历史日志`);
      void queryClient.invalidateQueries({ queryKey: ['admin-logs'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-logs-metrics'] });
    },
    onError: (err) => {
      toast.error(extractErrorMessage(err, '清理日志失败'));
    }
  });

  // 4. 导出日志
  const exportLogs = async (format: 'json' | 'csv') => {
    try {
      const timeParams = computeTimeRangeFilter(filter.timeRange);
      const params: Record<string, string | number | undefined> = {
        format,
        ...timeParams
      };
      if (filter.level !== 'ALL') params.level = filter.level;
      if (filter.source !== 'ALL') params.source = filter.source;
      if (filter.nodeId && filter.nodeId !== 'ALL') params.nodeId = filter.nodeId;
      if (filter.module) params.module = filter.module.trim();
      if (filter.traceId) params.traceId = filter.traceId.trim();
      if (filter.keyword) params.keyword = filter.keyword.trim();

      const res = await api.get('/logs/export', {
        params,
        responseType: 'blob'
      });

      const blob = new Blob([res.data], {
        type: format === 'csv' ? 'text/csv;charset=utf-8;' : 'application/json'
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `riricloud-logs-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('日志导出成功');
    } catch (err) {
      toast.error(extractErrorMessage(err, '导出日志失败'));
    }
  };

  return {
    logsQuery,
    metricsQuery,
    cleanMutation,
    exportLogs
  };
}

/**
 * SSE 实时推流 Hook
 */
export function useLiveTailStream(
  enabled: boolean,
  filter: LogsFilter,
  onNewLog: (item: SystemLogItem) => void
) {
  const user = useAuthStore((s) => s.user);
  const [isConnected, setIsConnected] = React.useState(false);

  React.useEffect(() => {
    if (!enabled || !user) {
      setIsConnected(false);
      return;
    }

    let eventSource: EventSource | undefined;
    let cancelled = false;
    void api.get<{ ticket: string }>('/logs/stream-ticket').then(({ data }) => {
      if (cancelled) return;
      const query = new URLSearchParams({ ticket: data.ticket });
      if (filter.level !== 'ALL') query.set('level', filter.level);
      if (filter.source !== 'ALL') query.set('source', filter.source);
      if (filter.nodeId && filter.nodeId !== 'ALL') query.set('nodeId', filter.nodeId);
      if (filter.keyword) query.set('keyword', filter.keyword.trim());

      eventSource = new EventSource(`/api/v1/logs/stream?${query.toString()}`);
      eventSource.onopen = () => setIsConnected(true);
      eventSource.onmessage = (event) => {
        try {
          onNewLog(JSON.parse(event.data) as SystemLogItem);
        } catch {
          // ignore parse error
        }
      };
      eventSource.onerror = () => setIsConnected(false);
    }).catch(() => {
      if (!cancelled) setIsConnected(false);
    });

    return () => {
      cancelled = true;
      eventSource?.close();
      setIsConnected(false);
    };
  }, [enabled, user, filter.level, filter.source, filter.nodeId, filter.keyword, onNewLog]);

  return { isConnected };
}
