import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TelemetryPrismaService } from '../prisma/telemetry-prisma.service';
import { SettingsService } from '../system/settings.service';

export const DEFAULT_TRAFFIC_RETENTION_DAYS = 90;
export const DEFAULT_LEGACY_LOGS_RETENTION_DAYS = 7;

@Injectable()
export class TrafficCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TrafficCleanupService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly telemetryPrisma: TelemetryPrismaService,
    @Optional() private readonly settingsService?: SettingsService
  ) {}

  onModuleInit(): void {
    // 延迟 15 秒后执行首次存量数据自动平滑迁移与常规清理，避免拖慢应用启动
    setTimeout(() => {
      void this.repairLegacyTextBucketStarts().then(() => {
        void this.autoMigrateLegacyTrafficLogs().then(() => {
          void this.runCleanup();
        });
      });
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
    retentionDays?: number,
    legacyRetentionDays = DEFAULT_LEGACY_LOGS_RETENTION_DAYS
  ): Promise<{ deletedHourlyCount: number; deletedLegacyCount: number }> {
    let deletedHourlyCount = 0;
    let deletedLegacyCount = 0;
    const settings = await this.settingsService?.getSettings();
    const effectiveRetentionDays = retentionDays ?? settings?.trafficHourlyRetentionDays ?? DEFAULT_TRAFFIC_RETENTION_DAYS;

    try {
      // 1. 清理 90 天前的小时桶时序记录
      const hourlyCutoff = new Date(Date.now() - effectiveRetentionDays * 24 * 3600 * 1000);
      const hourlyResult = await this.telemetryPrisma.trafficHourlyMetric.deleteMany({
        where: { bucketStart: { lt: hourlyCutoff } }
      });
      deletedHourlyCount = hourlyResult.count;
      if (deletedHourlyCount > 0) {
        this.logger.log(`Auto cleanup expired traffic hourly metrics: purged ${deletedHourlyCount} records (retention=${effectiveRetentionDays}d)`);
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

  /**
   * 自动平滑迁移存量未分桶的旧 TrafficLog 记录至 TrafficHourlyMetric
   * 采用小批量事务（默认每批 2000 行）聚合，并直接在同事务中清理已处理行，保证幂等与低内存开销
   */
  async autoMigrateLegacyTrafficLogs(batchSize = 2000): Promise<number> {
    try {
      const count = await this.prisma.trafficLog.count();
      if (count === 0) return 0;

      this.logger.log(`Detected ${count} legacy TrafficLog records, starting background auto-migration...`);

      const lines = await this.prisma.line.findMany({
        select: { id: true, trafficRate: true }
      });
      const rateByLineId = new Map<string, number>();
      for (const line of lines) {
        rateByLineId.set(line.id, line.trafficRate && line.trafficRate > 0 ? line.trafficRate : 1);
      }

      let migratedCount = 0;
      while (true) {
        const rawLogs = await this.prisma.trafficLog.findMany({
          take: batchSize,
          orderBy: { id: 'asc' }
        });
        if (rawLogs.length === 0) break;

        const buckets = new Map<string, {
          bucketStart: Date;
          nodeId: string;
          userId: string;
          lineId: string;
          proxyKeyId: string;
          upload: bigint;
          download: bigint;
          billedBytes: bigint;
        }>();

        const logIds: string[] = [];
        for (const log of rawLogs) {
          logIds.push(log.id);
          const date = new Date(log.recordedAt);
          date.setUTCMinutes(0, 0, 0);

          const lineId = log.lineId ?? '';
          const proxyKeyId = log.proxyKeyId ?? '';
          const key = `${date.toISOString()}:${log.nodeId}:${log.userId}:${lineId}:${proxyKeyId}`;

          const rate = lineId ? (rateByLineId.get(lineId) ?? 1) : 1;
          const billed = BigInt(Math.round(Number(log.upload + log.download) * rate));

          const existing = buckets.get(key);
          if (existing) {
            existing.upload += log.upload;
            existing.download += log.download;
            existing.billedBytes += billed;
          } else {
            buckets.set(key, {
              bucketStart: date,
              nodeId: log.nodeId,
              userId: log.userId,
              lineId,
              proxyKeyId,
              upload: log.upload,
              download: log.download,
              billedBytes: billed
            });
          }
        }

        await this.telemetryPrisma.$transaction(async (tx) => {
          for (const item of buckets.values()) {
            await tx.$executeRawUnsafe(
              `INSERT INTO "TrafficHourlyMetric" ("id", "bucketStart", "nodeId", "userId", "lineId", "proxyKeyId", "upload", "download", "billedBytes", "createdAt", "updatedAt")
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
              ON CONFLICT("bucketStart", "nodeId", "userId", "lineId", "proxyKeyId")
              DO UPDATE SET
                "upload" = "upload" + excluded."upload",
                "download" = "download" + excluded."download",
                "billedBytes" = "billedBytes" + excluded."billedBytes",
                "updatedAt" = CURRENT_TIMESTAMP`,
              randomUUID(),
              item.bucketStart.getTime(),
              item.nodeId,
              item.userId,
              item.lineId,
              item.proxyKeyId,
              item.upload.toString(),
              item.download.toString(),
              item.billedBytes.toString()
            );
          }
        });

        await this.prisma.trafficLog.deleteMany({
          where: { id: { in: logIds } }
        });

        migratedCount += rawLogs.length;
        if (rawLogs.length < batchSize) break;
      }

      this.logger.log(`Auto migration completed: successfully merged ${migratedCount} legacy records into TrafficHourlyMetric`);
      return migratedCount;
    } catch (err) {
      this.logger.warn(`Auto migration of legacy traffic logs failed: ${String(err)}`);
      return 0;
    }
  }

  /**
   * 自动平滑修复 TrafficHourlyMetric 中历史遗留的 TEXT 格式 bucketStart
   * 转换为 INTEGER 毫秒时间戳，并处理同一主键冲突下的流量累加合并
   */
  async repairLegacyTextBucketStarts(batchSize = 500): Promise<number> {
    try {
      let totalRepaired = 0;
      while (true) {
        const rows = await this.telemetryPrisma.$queryRawUnsafe<Array<{
          id: string;
          bucketStart: string;
          nodeId: string;
          userId: string;
          lineId: string;
          proxyKeyId: string;
          upload: bigint | number | string;
          download: bigint | number | string;
          billedBytes: bigint | number | string;
        }>>(
          `SELECT "id", "bucketStart", "nodeId", "userId", "lineId", "proxyKeyId", "upload", "download", "billedBytes"
           FROM "TrafficHourlyMetric"
           WHERE typeof("bucketStart") = 'text'
           LIMIT ?`,
          batchSize
        );

        if (!rows || rows.length === 0) break;

        await this.telemetryPrisma.$transaction(async (tx) => {
          for (const row of rows) {
            const dateMs = new Date(row.bucketStart).getTime();
            if (!Number.isFinite(dateMs)) {
              continue;
            }

            const existing = await tx.$queryRawUnsafe<Array<{ id: string }>>(
              `SELECT "id" FROM "TrafficHourlyMetric"
               WHERE "bucketStart" = ? AND "nodeId" = ? AND "userId" = ? AND "lineId" = ? AND "proxyKeyId" = ? AND "id" != ?`,
              dateMs, row.nodeId, row.userId, row.lineId, row.proxyKeyId, row.id
            );

            if (existing && existing.length > 0) {
              await tx.$executeRawUnsafe(
                `UPDATE "TrafficHourlyMetric"
                 SET "upload" = "upload" + ?, "download" = "download" + ?, "billedBytes" = "billedBytes" + ?, "updatedAt" = CURRENT_TIMESTAMP
                 WHERE "id" = ?`,
                row.upload.toString(), row.download.toString(), row.billedBytes.toString(), existing[0].id
              );
              await tx.$executeRawUnsafe(`DELETE FROM "TrafficHourlyMetric" WHERE "id" = ?`, row.id);
            } else {
              await tx.$executeRawUnsafe(
                `UPDATE "TrafficHourlyMetric"
                 SET "bucketStart" = ?, "updatedAt" = CURRENT_TIMESTAMP
                 WHERE "id" = ?`,
                dateMs, row.id
              );
            }
          }
        });

        totalRepaired += rows.length;
        if (rows.length < batchSize) break;
      }

      if (totalRepaired > 0) {
        this.logger.log(`Auto repaired ${totalRepaired} legacy TrafficHourlyMetric records (converted TEXT to INTEGER timestamp)`);
      }
      return totalRepaired;
    } catch (err) {
      this.logger.warn(`Failed to repair legacy text bucketStarts in TrafficHourlyMetric: ${String(err)}`);
      return 0;
    }
  }
}
