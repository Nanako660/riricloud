export interface TrendBucket {
  bucket: string; // "YYYY-MM-DD HH:00"
  total: number;
  info: number;
  warn: number;
  error: number;
  debug: number;
}

export interface LogMetricsDto {
  totalLogs: number;
  errorCount24h: number;
  warnCount24h: number;
  avgLatencyMs: number;
  trend: TrendBucket[];
}
