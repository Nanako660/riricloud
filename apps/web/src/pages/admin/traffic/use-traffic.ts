import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const trafficRanges = ['today', '24h', '7d', '30d'] as const;
export type TrafficTimeRange = (typeof trafficRanges)[number];

export const trafficRangeLabels: Record<TrafficTimeRange, string> = {
  today: '今日',
  '24h': '24 小时',
  '7d': '7 天',
  '30d': '30 天'
};

export interface TrafficTimeSeriesPoint {
  timestamp: string;
  displayTime: string;
  upload: number;
  download: number;
  total: number;
  billedTotal: number;
}

export interface LineTrafficRankItem {
  lineId: string | null;
  lineName: string;
  protocolType?: string;
  lineType?: string;
  trafficRate: number;
  upload: number;
  download: number;
  total: number;
  billedTotal: number;
  percentage: number;
}

export interface RateSeriesPoint {
  timestamp: string;
  displayTime: string;
  uploadRate: number;
  downloadRate: number;
  peakUploadRate: number;
  peakDownloadRate: number;
  sampleCount: number;
}

export interface TrafficOverviewResponse {
  timeRange: TrafficTimeRange;
  bucketType: 'hour' | 'day';
  summary: {
    totalUpload: number;
    totalDownload: number;
    totalPhysical: number;
    totalBilled: number;
    activeLinesCount: number;
    totalLinesCount: number;
    activeUsersCount: number;
    totalUsersCount: number;
  };
  timeSeries: TrafficTimeSeriesPoint[];
  lineRankings: LineTrafficRankItem[];
  rate: {
    currentUploadRate: number;
    currentDownloadRate: number;
    averageUploadRate: number;
    averageDownloadRate: number;
    peakUploadRate: number;
    peakDownloadRate: number;
    unit: 'bytes/s';
    scope: 'node-network';
  };
  rateSeries: RateSeriesPoint[];
}

export interface UserTrafficDetailResponse {
  userId: string;
  email: string;
  role: string;
  isActive: boolean;
  timeRange: TrafficTimeRange;
  bucketType: 'hour' | 'day';
  quota: {
    trafficLimitBytes: number;
    trafficUsedBytes: number;
    remainingBytes: number;
    expireAt: string | null;
    planName: string | null;
  };
  summary: {
    periodUpload: number;
    periodDownload: number;
    periodTotal: number;
    periodBilled: number;
  };
  timeSeries: TrafficTimeSeriesPoint[];
  lineBreakdown: LineTrafficRankItem[];
}

export function useTrafficOverview(range: TrafficTimeRange) {
  return useQuery({
    queryKey: ['admin', 'traffic', 'overview', range],
    queryFn: async () => (await api.get<TrafficOverviewResponse>('/admin/traffic/overview', { params: { range } })).data,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true
  });
}

export function useUserTrafficDetail(userId: string | null, range: TrafficTimeRange, enabled = true) {
  return useQuery({
    queryKey: ['admin', 'traffic', 'user', userId, range],
    queryFn: async () => (await api.get<UserTrafficDetailResponse>(`/admin/traffic/users/${userId}`, { params: { range } })).data,
    enabled: enabled && Boolean(userId),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true
  });
}
