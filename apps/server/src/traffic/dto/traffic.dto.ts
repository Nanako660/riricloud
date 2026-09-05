import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export const TRAFFIC_RANGES = ['today', '24h', '7d', '30d'] as const;
export type TrafficTimeRange = (typeof TRAFFIC_RANGES)[number];
export type TrafficBucketType = 'hour' | 'day';
export type RateBucketType = '5m' | '30m' | '1h';

export class QueryTrafficDto {
  @ApiPropertyOptional({ enum: TRAFFIC_RANGES, default: 'today' })
  @IsOptional()
  @IsIn(TRAFFIC_RANGES)
  range?: TrafficTimeRange = 'today';
}

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

export interface UserTrafficRankItem {
  userId: string;
  email: string;
  role: string;
  isActive: boolean;
  planName: string | null;
  upload: number;
  download: number;
  total: number;
  billedTotal: number;
  percentage: number;
}

export interface TrafficOverviewResponse {
  timeRange: TrafficTimeRange;
  bucketType: TrafficBucketType;
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
  userRankings: UserTrafficRankItem[];
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
  rateSeries: Array<{
    timestamp: string;
    displayTime: string;
    uploadRate: number;
    downloadRate: number;
    peakUploadRate: number;
    peakDownloadRate: number;
    sampleCount: number;
  }>;
}

export interface UserTrafficDetailResponse {
  userId: string;
  email: string;
  role: string;
  isActive: boolean;
  timeRange: TrafficTimeRange;
  bucketType: TrafficBucketType;
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
