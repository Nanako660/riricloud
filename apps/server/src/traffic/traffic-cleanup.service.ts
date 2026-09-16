import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const DEFAULT_TRAFFIC_RETENTION_DAYS = 90;
export const DEFAULT_LEGACY_LOGS_RETENTION_DAYS = 7;

@Injectable()
export class TrafficCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TrafficCleanupService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    // 延迟 15 秒后执行首次清理，避免拖慢应用启动
    setTimeout(() => {
      void this.runCleanup();
    }, 15_000);

    // 每 12 小时定时巡检清理超期流量记录
    this.timer = setInterval(() => {
      void this.runCleanup();
    }, 12 * 3600 * 1000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runCleanup(
    retentionDays = DEFAULT_TRAFFIC_RETENTION_DAYS,
    legacyRetentionDays = DEFAULT_LEGACY_LOGS_RETENTION_DAYS
  ): Promise<{ deletedHourlyCount: number; deletedLegacyCount: number }> {
    let deletedHourlyCount = 0;
    let deletedLegacyCount = 0;

    try {
      // 1. 清理 90 天前的小时桶时序记录
      const hourlyCutoff = new Date(Date.now() - retentionDays * 24 * 3600 * 1000);
      const hourlyResult = await this.prisma.trafficHourlyMetric.deleteMany({
        where: { bucketStart: { lt: hourlyCutoff } }
      });
      deletedHourlyCount = hourlyResult.count;
      if (deletedHourlyCount > 0) {
        this.logger.log(`Auto cleanup expired traffic hourly metrics: purged ${deletedHourlyCount} records (retention=${retentionDays}d)`);
      }

      // 2. 清理存量未清除的旧 TrafficLog 记录（默认保留不超过 7 天）
      const legacyCutoff = new Date(Date.now() - legacyRetentionDays * 24 * 3600 * 1000);
      const legacyResult = await this.prisma.trafficLog.deleteMany({
        where: { recordedAt: { lt: legacyCutoff } }
      });
      deletedLegacyCount = legacyResult.count;
      if (deletedLegacyCount > 0) {
        this.logger.log(`Auto cleanup expired legacy traffic logs: purged ${deletedLegacyCount} records (retention=${legacyRetentionDays}d)`);
      }
    } catch (err) {
      this.logger.warn(`Failed to run traffic cleanup: ${String(err)}`);
    }

    return { deletedHourlyCount, deletedLegacyCount };
  }
}
