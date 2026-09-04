import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../system/settings.service';
import {
  type LineTrafficRankItem,
  type RateBucketType,
  type TrafficBucketType,
  type TrafficOverviewResponse,
  type TrafficTimeRange,
  type TrafficTimeSeriesPoint,
  type UserTrafficDetailResponse
} from './dto/traffic.dto';

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const RATE_METRIC_BUCKET_MS = 5 * MINUTE_MS;
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 15 * 1000;
const UNASSIGNED_LINE_KEY = '__unassigned__';
const UNASSIGNED_LINE_NAME = '未分配线路（节点直连）';

type TrafficLine = {
  id: string;
  name: string;
  protocolType: string;
  type: string;
  trafficRate: number;
};

type FallbackTrafficLine = TrafficLine & {
  entryNodeId: string;
  exitNodeId: string;
  relayMode: string | null;
};

type TrafficRow = {
  nodeId: string;
  userId: string;
  upload: bigint;
  download: bigint;
  recordedAt: Date;
  line: TrafficLine | null;
};

type RangeConfig = {
  bucketType: TrafficBucketType;
  bucketStart: Date;
  bucketCount: number;
  bucketKeys: string[];
  bucketDates: Date[];
  periodEnd: Date;
};

type LineAggregate = {
  line: TrafficLine | null;
  upload: bigint;
  download: bigint;
};

type SeriesAggregate = {
  upload: bigint;
  download: bigint;
  billedTotal: number;
};

type Aggregation = {
  totalUpload: bigint;
  totalDownload: bigint;
  totalBilled: number;
  activeUsers: Set<string>;
  activeLines: Set<string>;
  lineAggregates: Map<string, LineAggregate>;
  series: SeriesAggregate[];
};

type RateMetricRow = {
  nodeId: string;
  bucketStart: Date;
  sampleCount: number;
  uploadRateSum: number;
  downloadRateSum: number;
  uploadRatePeak: number;
  downloadRatePeak: number;
};

type RateRangeConfig = {
  bucketType: RateBucketType;
  bucketMs: number;
  bucketStart: Date;
  bucketDates: Date[];
  periodEnd: Date;
};

type RateBucketAggregate = {
  sampleCount: number;
  uploadRateSum: number;
  downloadRateSum: number;
  nodePeaks: Map<string, { uploadRatePeak: number; downloadRatePeak: number }>;
};

@Injectable()
export class TrafficService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly settingsService?: SettingsService
  ) {}

  async getOverview(range: TrafficTimeRange = 'today'): Promise<TrafficOverviewResponse> {
    const config = this.buildRange(range);
    const [rows, fallbackLines, totalLinesCount, totalUsersCount, rateOverview] = await Promise.all([
      this.findTrafficRows(config),
      this.findFallbackLines(),
      this.prisma.line.count(),
      this.prisma.user.count(),
      this.getRateOverview(range)
    ]);
    const aggregation = this.aggregate(rows, fallbackLines, config);
    const lineRankings = this.toLineRankings(aggregation.lineAggregates, aggregation.totalUpload + aggregation.totalDownload);

    return {
      timeRange: range,
      bucketType: config.bucketType,
      summary: {
        totalUpload: this.toNumber(aggregation.totalUpload),
        totalDownload: this.toNumber(aggregation.totalDownload),
        totalPhysical: this.toNumber(aggregation.totalUpload + aggregation.totalDownload),
        totalBilled: this.round2(aggregation.totalBilled),
        activeLinesCount: aggregation.activeLines.size,
        totalLinesCount,
        activeUsersCount: aggregation.activeUsers.size,
        totalUsersCount
      },
      timeSeries: this.toTimeSeries(aggregation.series, config),
      lineRankings,
      ...rateOverview
    };
  }

  private async getRateOverview(range: TrafficTimeRange): Promise<Pick<TrafficOverviewResponse, 'rate' | 'rateSeries'>> {
    const config = this.buildRateRange(range);
    const [metrics, current] = await Promise.all([
      this.findRateMetrics(config),
      this.findCurrentRates(new Date())
    ]);
    const buckets = Array.from({ length: config.bucketDates.length }, (): RateBucketAggregate => ({
      sampleCount: 0,
      uploadRateSum: 0,
      downloadRateSum: 0,
      nodePeaks: new Map()
    }));
    let totalSamples = 0;
    let totalUploadRateSum = 0;
    let totalDownloadRateSum = 0;

    for (const metric of metrics) {
      const bucketIndex = Math.floor((metric.bucketStart.getTime() - config.bucketStart.getTime()) / config.bucketMs);
      if (bucketIndex < 0 || bucketIndex >= buckets.length) continue;
      const bucket = buckets[bucketIndex];
      bucket.sampleCount += metric.sampleCount;
      bucket.uploadRateSum += metric.uploadRateSum;
      bucket.downloadRateSum += metric.downloadRateSum;
      const previousPeak = bucket.nodePeaks.get(metric.nodeId) ?? { uploadRatePeak: 0, downloadRatePeak: 0 };
      bucket.nodePeaks.set(metric.nodeId, {
        uploadRatePeak: Math.max(previousPeak.uploadRatePeak, metric.uploadRatePeak),
        downloadRatePeak: Math.max(previousPeak.downloadRatePeak, metric.downloadRatePeak)
      });
      totalSamples += metric.sampleCount;
      totalUploadRateSum += metric.uploadRateSum;
      totalDownloadRateSum += metric.downloadRateSum;
    }

    const rateSeries = buckets.map((bucket, index) => {
      let peakUploadRate = 0;
      let peakDownloadRate = 0;
      for (const peak of bucket.nodePeaks.values()) {
        peakUploadRate += peak.uploadRatePeak;
        peakDownloadRate += peak.downloadRatePeak;
      }
      const bucketDate = config.bucketDates[index];
      return {
        timestamp: bucketDate.toISOString(),
        displayTime: this.formatRateDisplay(bucketDate, config.bucketType),
        uploadRate: this.round2(bucket.sampleCount > 0 ? bucket.uploadRateSum / bucket.sampleCount : 0),
        downloadRate: this.round2(bucket.sampleCount > 0 ? bucket.downloadRateSum / bucket.sampleCount : 0),
        peakUploadRate: this.round2(peakUploadRate),
        peakDownloadRate: this.round2(peakDownloadRate),
        sampleCount: bucket.sampleCount
      };
    });
    const peakUploadRate = rateSeries.reduce((peak, item) => Math.max(peak, item.peakUploadRate), 0);
    const peakDownloadRate = rateSeries.reduce((peak, item) => Math.max(peak, item.peakDownloadRate), 0);
    return {
      rate: {
        currentUploadRate: this.round2(current.uploadRate),
        currentDownloadRate: this.round2(current.downloadRate),
        averageUploadRate: this.round2(totalSamples > 0 ? totalUploadRateSum / totalSamples : 0),
        averageDownloadRate: this.round2(totalSamples > 0 ? totalDownloadRateSum / totalSamples : 0),
        peakUploadRate: this.round2(peakUploadRate),
        peakDownloadRate: this.round2(peakDownloadRate),
        unit: 'bytes/s',
        scope: 'node-network'
      },
      rateSeries
    };
  }

  private async findRateMetrics(config: RateRangeConfig): Promise<RateMetricRow[]> {
    const delegate = (this.prisma as unknown as {
      nodeRateMetric?: { findMany: (args: Record<string, unknown>) => Promise<RateMetricRow[]> };
    }).nodeRateMetric;
    if (!delegate) return [];
    return delegate.findMany({
      where: { bucketStart: { gte: config.bucketStart, lt: config.periodEnd } },
      select: {
        nodeId: true,
        bucketStart: true,
        sampleCount: true,
        uploadRateSum: true,
        downloadRateSum: true,
        uploadRatePeak: true,
        downloadRatePeak: true
      },
      orderBy: { bucketStart: 'asc' }
    });
  }

  private async findCurrentRates(now: Date): Promise<{ uploadRate: number; downloadRate: number }> {
    const nodeDelegate = (this.prisma as unknown as {
      node?: { findMany: (args: Record<string, unknown>) => Promise<Array<{
        status: string;
        communicationMode?: string;
        pollIntervalSecs?: number;
        lastSeenAt: Date | null;
        uploadRate: number | null;
        downloadRate: number | null;
      }>> };
    }).node;
    if (!nodeDelegate) return { uploadRate: 0, downloadRate: 0 };
    const settings = await this.settingsService?.getSettings();
    const timeoutMs = (settings?.heartbeatTimeoutSecs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS / 1000) * 1000;
    const nodes = await nodeDelegate.findMany({
      where: { status: 'ONLINE' },
      select: { status: true, communicationMode: true, pollIntervalSecs: true, lastSeenAt: true, uploadRate: true, downloadRate: true }
    });
    return nodes.reduce((total, node) => {
      const staleWindowMs = node.communicationMode === 'HTTP'
        ? Math.max(timeoutMs, (node.pollIntervalSecs ?? 15) * 3_000)
        : timeoutMs;
      const fresh = node.lastSeenAt && now.getTime() - node.lastSeenAt.getTime() <= staleWindowMs;
      if (!fresh || node.uploadRate == null || node.downloadRate == null) return total;
      return {
        uploadRate: total.uploadRate + this.nonNegativeFinite(node.uploadRate),
        downloadRate: total.downloadRate + this.nonNegativeFinite(node.downloadRate)
      };
    }, { uploadRate: 0, downloadRate: 0 });
  }

  async getUserDetail(userId: string, range: TrafficTimeRange = 'today'): Promise<UserTrafficDetailResponse> {
    const config = this.buildRange(range);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        trafficLimitBytes: true,
        trafficUsedBytes: true,
        expireAt: true,
        subscription: {
          select: {
            trafficLimitBytes: true,
            trafficUsedBytes: true,
            expireAt: true,
            plan: { select: { name: true } }
          }
        }
      }
    });
    if (!user) throw new NotFoundException('用户不存在');

    const [rows, fallbackLines] = await Promise.all([
      this.findTrafficRows(config, userId),
      this.findFallbackLines()
    ]);
    const aggregation = this.aggregate(rows, fallbackLines, config);
    const lineBreakdown = this.toLineRankings(aggregation.lineAggregates, aggregation.totalUpload + aggregation.totalDownload);
    const quota = user.subscription ?? user;
    const limit = this.toNumber(quota.trafficLimitBytes);
    const used = this.toNumber(quota.trafficUsedBytes);

    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      timeRange: range,
      bucketType: config.bucketType,
      quota: {
        trafficLimitBytes: limit,
        trafficUsedBytes: used,
        remainingBytes: Math.max(limit - used, 0),
        expireAt: quota.expireAt?.toISOString() ?? null,
        planName: user.subscription?.plan?.name ?? null
      },
      summary: {
        periodUpload: this.toNumber(aggregation.totalUpload),
        periodDownload: this.toNumber(aggregation.totalDownload),
        periodTotal: this.toNumber(aggregation.totalUpload + aggregation.totalDownload),
        periodBilled: this.round2(aggregation.totalBilled)
      },
      timeSeries: this.toTimeSeries(aggregation.series, config),
      lineBreakdown
    };
  }

  private async findTrafficRows(config: RangeConfig, userId?: string): Promise<TrafficRow[]> {
    return this.prisma.trafficLog.findMany({
      where: {
        ...(userId ? { userId } : {}),
        recordedAt: { gte: config.bucketStart, lt: config.periodEnd }
      },
      select: {
        nodeId: true,
        userId: true,
        upload: true,
        download: true,
        recordedAt: true,
        line: { select: { id: true, name: true, protocolType: true, type: true, trafficRate: true } }
      },
      orderBy: { recordedAt: 'asc' }
    }) as unknown as Promise<TrafficRow[]>;
  }

  private async findFallbackLines(): Promise<FallbackTrafficLine[]> {
    return this.prisma.line.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        protocolType: true,
        type: true,
        trafficRate: true,
        entryNodeId: true,
        exitNodeId: true,
        relayMode: true
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
    }) as unknown as Promise<FallbackTrafficLine[]>;
  }

  private aggregate(
    rows: TrafficRow[],
    fallbackLines: FallbackTrafficLine[],
    config: RangeConfig
  ): Aggregation {
    const fallbackByEntryNode = new Map<string, TrafficLine>();
    const fallbackByBlindExitNode = new Map<string, TrafficLine>();
    for (const line of fallbackLines) {
      if (!fallbackByEntryNode.has(line.entryNodeId)) fallbackByEntryNode.set(line.entryNodeId, line);
      if (line.type === 'RELAY' && line.relayMode === 'BLIND_FORWARD' && !fallbackByBlindExitNode.has(line.exitNodeId)) {
        fallbackByBlindExitNode.set(line.exitNodeId, line);
      }
    }
    const aggregation: Aggregation = {
      totalUpload: 0n,
      totalDownload: 0n,
      totalBilled: 0,
      activeUsers: new Set<string>(),
      activeLines: new Set<string>(),
      lineAggregates: new Map<string, LineAggregate>(),
      series: Array.from({ length: config.bucketCount }, () => ({ upload: 0n, download: 0n, billedTotal: 0 }))
    };

    for (const row of rows) {
      const upload = row.upload < 0n ? 0n : row.upload;
      const download = row.download < 0n ? 0n : row.download;
      const total = upload + download;
      const line = row.line ?? fallbackByEntryNode.get(row.nodeId) ?? fallbackByBlindExitNode.get(row.nodeId) ?? null;
      const trafficRate = this.getTrafficRate(line);
      const billedTotal = this.toNumber(total) * trafficRate;
      const lineKey = line?.id ?? UNASSIGNED_LINE_KEY;
      const current = aggregation.lineAggregates.get(lineKey) ?? { line, upload: 0n, download: 0n };
      current.upload += upload;
      current.download += download;
      aggregation.lineAggregates.set(lineKey, current);
      aggregation.totalUpload += upload;
      aggregation.totalDownload += download;
      aggregation.totalBilled += billedTotal;
      if (total > 0n) {
        aggregation.activeUsers.add(row.userId);
        if (line) aggregation.activeLines.add(line.id);
      }

      const bucketIndex = this.getBucketIndex(row.recordedAt, config);
      if (bucketIndex >= 0 && bucketIndex < aggregation.series.length) {
        aggregation.series[bucketIndex].upload += upload;
        aggregation.series[bucketIndex].download += download;
        aggregation.series[bucketIndex].billedTotal += billedTotal;
      }
    }
    return aggregation;
  }

  private toLineRankings(lineAggregates: Map<string, LineAggregate>, totalPhysical: bigint): LineTrafficRankItem[] {
    const total = this.toNumber(totalPhysical);
    return Array.from(lineAggregates.values())
      .map(({ line, upload, download }) => {
        const physical = upload + download;
        const trafficRate = this.getTrafficRate(line);
        return {
          lineId: line?.id ?? null,
          lineName: line?.name ?? UNASSIGNED_LINE_NAME,
          ...(line ? { protocolType: line.protocolType, lineType: line.type } : {}),
          trafficRate,
          upload: this.toNumber(upload),
          download: this.toNumber(download),
          total: this.toNumber(physical),
          billedTotal: this.round2(this.toNumber(physical) * trafficRate),
          percentage: total > 0 ? this.round2((this.toNumber(physical) / total) * 100) : 0
        };
      })
      .sort((left, right) => right.billedTotal - left.billedTotal);
  }

  private toTimeSeries(series: SeriesAggregate[], config: RangeConfig): TrafficTimeSeriesPoint[] {
    return series.map((point, index) => {
      const upload = this.toNumber(point.upload);
      const download = this.toNumber(point.download);
      const bucketDate = config.bucketDates[index];
      return {
        timestamp: this.formatTimestamp(bucketDate, config.bucketType),
        displayTime: config.bucketType === 'hour' ? this.formatHour(bucketDate) : this.formatShortDate(bucketDate),
        upload,
        download,
        total: upload + download,
        billedTotal: this.round2(point.billedTotal)
      };
    });
  }

  private buildRange(range: TrafficTimeRange): RangeConfig {
    const now = new Date();
    const bucketType: TrafficBucketType = range === 'today' || range === '24h' ? 'hour' : 'day';
    const bucketCount = range === 'today' || range === '24h' ? 24 : range === '7d' ? 7 : 30;
    const bucketStart = range === 'today' ? this.startOfDay(now) : this.startOfBucket(now, bucketType);
    if (range === '24h') bucketStart.setTime(bucketStart.getTime() - (bucketCount - 1) * HOUR_MS);
    if (range === '7d' || range === '30d') bucketStart.setDate(bucketStart.getDate() - (bucketCount - 1));
    const bucketDates = Array.from({ length: bucketCount }, (_, index) => {
      const date = new Date(bucketStart);
      if (bucketType === 'hour') date.setTime(date.getTime() + index * HOUR_MS);
      else date.setDate(date.getDate() + index);
      return date;
    });
    return {
      bucketType,
      bucketStart,
      bucketCount,
      bucketKeys: bucketDates.map((date) => this.formatDate(date)),
      bucketDates,
      periodEnd: now
    };
  }

  private buildRateRange(range: TrafficTimeRange): RateRangeConfig {
    const now = new Date();
    const bucketType: RateBucketType = range === 'today' || range === '24h' ? '5m' : range === '7d' ? '30m' : '1h';
    const bucketMs = bucketType === '5m' ? RATE_METRIC_BUCKET_MS : bucketType === '30m' ? 30 * MINUTE_MS : HOUR_MS;
    let start: Date;
    if (range === 'today') {
      start = this.startOfDay(now);
    } else if (range === '24h') {
      start = new Date(now.getTime() - 24 * HOUR_MS);
    } else {
      start = this.startOfDay(now);
      start.setDate(start.getDate() - (range === '7d' ? 6 : 29));
    }
    const bucketStart = new Date(Math.floor(start.getTime() / bucketMs) * bucketMs);
    const bucketCount = Math.max(1, Math.floor((now.getTime() - bucketStart.getTime()) / bucketMs) + 1);
    const bucketDates = Array.from({ length: bucketCount }, (_, index) => new Date(bucketStart.getTime() + index * bucketMs));
    return { bucketType, bucketMs, bucketStart, bucketDates, periodEnd: now };
  }

  private startOfBucket(date: Date, bucketType: TrafficBucketType): Date {
    const result = new Date(date);
    if (bucketType === 'hour') result.setMinutes(0, 0, 0);
    else result.setHours(0, 0, 0, 0);
    return result;
  }

  private startOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  private getBucketIndex(date: Date, config: RangeConfig): number {
    if (config.bucketType === 'hour') return Math.floor((date.getTime() - config.bucketStart.getTime()) / HOUR_MS);
    return config.bucketKeys.indexOf(this.formatDate(date));
  }

  private getTrafficRate(line: TrafficLine | null): number {
    return line && Number.isFinite(line.trafficRate) && line.trafficRate >= 0 ? line.trafficRate : 1;
  }

  private nonNegativeFinite(value: number): number {
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }

  private formatRateDisplay(date: Date, bucketType: RateBucketType): string {
    const day = `${this.pad(date.getMonth() + 1)}-${this.pad(date.getDate())}`;
    if (bucketType === '1h') return `${day} ${this.formatHour(date)}`;
    return `${day} ${this.pad(date.getHours())}:${this.pad(date.getMinutes())}`;
  }

  private formatTimestamp(date: Date, bucketType: TrafficBucketType): string {
    return bucketType === 'hour' ? `${this.formatDate(date)} ${this.formatHour(date)}` : this.formatDate(date);
  }

  private formatDate(date: Date): string {
    return `${date.getFullYear()}-${this.pad(date.getMonth() + 1)}-${this.pad(date.getDate())}`;
  }

  private formatShortDate(date: Date): string {
    return `${this.pad(date.getMonth() + 1)}-${this.pad(date.getDate())}`;
  }

  private formatHour(date: Date): string {
    return `${this.pad(date.getHours())}:00`;
  }

  private pad(value: number): string {
    return String(value).padStart(2, '0');
  }

  private toNumber(value: bigint): number {
    return Number(value);
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
