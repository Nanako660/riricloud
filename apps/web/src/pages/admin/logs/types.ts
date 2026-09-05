export type LogLevel = 'ALL' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export type LogSource = 'ALL' | 'SERVER' | 'WEB' | 'AGENT' | 'SINGBOX';

export interface SystemLogItem {
  id: string;
  traceId: string | null;
  source: 'SERVER' | 'WEB' | 'AGENT' | 'SINGBOX';
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  module: string;
  message: string;
  metadata: string;
  nodeId: string | null;
  userId: string | null;
  createdAt: string;
  node?: {
    id: string;
    name: string;
    serverHost: string;
  } | null;
  user?: {
    id: string;
    email: string;
    nickname?: string | null;
  } | null;
}

export interface TrendBucket {
  bucket: string;
  total: number;
  info: number;
  warn: number;
  error: number;
  debug: number;
}

export interface LogMetrics {
  totalLogs: number;
  errorCount24h: number;
  warnCount24h: number;
  avgLatencyMs: number;
  trend: TrendBucket[];
}

export interface LogsQueryResult {
  items: SystemLogItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface LogsFilter {
  level: LogLevel;
  source: LogSource;
  nodeId: string;
  module: string;
  traceId: string;
  keyword: string;
  timeRange: '15m' | '1h' | '24h' | '7d' | 'all';
  page: number;
  pageSize: number;
}
