import { PrismaService } from '../prisma/prisma.service';
import { TelemetryPrismaService } from '../prisma/telemetry-prisma.service';
import {
  DEFAULT_LEGACY_LOGS_RETENTION_DAYS,
  DEFAULT_TRAFFIC_RETENTION_DAYS,
  TrafficCleanupService
} from './traffic-cleanup.service';

interface MockPrisma {
  trafficLog: {
    count: jest.Mock;
    findMany: jest.Mock;
    deleteMany: jest.Mock;
  };
  line: {
    findMany: jest.Mock;
  };
  $executeRaw: jest.Mock;
  $transaction: jest.Mock;
}

interface MockTelemetryPrisma {
  trafficHourlyMetric: {
    deleteMany: jest.Mock;
  };
  $queryRawUnsafe: jest.Mock;
  $executeRawUnsafe: jest.Mock;
  $transaction: jest.Mock;
}

describe('TrafficCleanupService', () => {
  const prisma: MockPrisma = {
    trafficLog: {
      count: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn()
    },
    line: {
      findMany: jest.fn()
    },
    $executeRaw: jest.fn(),
    $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(prisma))
  };

  const telemetryPrisma: MockTelemetryPrisma = {
    trafficHourlyMetric: {
      deleteMany: jest.fn()
    },
    $queryRawUnsafe: jest.fn(),
    $executeRawUnsafe: jest.fn(),
    $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(telemetryPrisma))
  };

  let service: TrafficCleanupService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.trafficLog.count.mockResolvedValue(0);
    prisma.trafficLog.findMany.mockResolvedValue([]);
    prisma.line.findMany.mockResolvedValue([]);
    service = new TrafficCleanupService(
      prisma as unknown as PrismaService,
      telemetryPrisma as unknown as TelemetryPrismaService
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('runCleanup 能够正确按 90 天清理小时时序并按 7 天清理旧 TrafficLog', async () => {
    telemetryPrisma.trafficHourlyMetric.deleteMany.mockResolvedValue({ count: 42 });
    prisma.trafficLog.deleteMany.mockResolvedValue({ count: 15 });

    const fixedNow = new Date('2026-09-17T00:00:00.000Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(fixedNow);

    const result = await service.runCleanup();

    expect(result).toEqual({ deletedHourlyCount: 42, deletedLegacyCount: 15 });

    const expectedHourlyCutoff = new Date(fixedNow - DEFAULT_TRAFFIC_RETENTION_DAYS * 24 * 3600 * 1000);
    const expectedLegacyCutoff = new Date(fixedNow - DEFAULT_LEGACY_LOGS_RETENTION_DAYS * 24 * 3600 * 1000);

    expect(telemetryPrisma.trafficHourlyMetric.deleteMany).toHaveBeenCalledWith({
      where: { bucketStart: { lt: expectedHourlyCutoff } }
    });
    expect(prisma.trafficLog.deleteMany).toHaveBeenCalledWith({
      where: { recordedAt: { lt: expectedLegacyCutoff } }
    });
  });

  it('runCleanup 在 Prisma 抛出异常时能安全捕获并返回 0', async () => {
    telemetryPrisma.trafficHourlyMetric.deleteMany.mockRejectedValue(new Error('DB connection failed'));

    const result = await service.runCleanup();

    expect(result).toEqual({ deletedHourlyCount: 0, deletedLegacyCount: 0 });
  });

  it('autoMigrateLegacyTrafficLogs 在没有存量明细时快速返回 0', async () => {
    prisma.trafficLog.count.mockResolvedValue(0);

    const migrated = await service.autoMigrateLegacyTrafficLogs();
    expect(migrated).toBe(0);
    expect(prisma.trafficLog.findMany).not.toHaveBeenCalled();
  });

  it('autoMigrateLegacyTrafficLogs 能够将存量日志合并并写入小时桶与清理旧明细', async () => {
    prisma.trafficLog.count.mockResolvedValue(2);
    prisma.line.findMany.mockResolvedValue([{ id: 'line-1', trafficRate: 1.5 }]);
    prisma.trafficLog.findMany
      .mockResolvedValueOnce([
        {
          id: 'log-1',
          recordedAt: new Date('2026-09-16T10:15:00.000Z'),
          nodeId: 'node-1',
          userId: 'user-1',
          lineId: 'line-1',
          proxyKeyId: null,
          upload: 100n,
          download: 200n
        },
        {
          id: 'log-2',
          recordedAt: new Date('2026-09-16T10:45:00.000Z'),
          nodeId: 'node-1',
          userId: 'user-1',
          lineId: 'line-1',
          proxyKeyId: null,
          upload: 50n,
          download: 50n
        }
      ])
      .mockResolvedValueOnce([]);

    prisma.trafficLog.deleteMany.mockResolvedValue({ count: 2 });
    telemetryPrisma.$executeRawUnsafe.mockResolvedValue(1);

    const migrated = await service.autoMigrateLegacyTrafficLogs(100);

    expect(migrated).toBe(2);
    expect(telemetryPrisma.$transaction).toHaveBeenCalled();
    expect(telemetryPrisma.$executeRawUnsafe).toHaveBeenCalled();
    expect(prisma.trafficLog.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['log-1', 'log-2'] } }
    });
  });

  it('onModuleInit 与 onModuleDestroy 能够正常注册和注销定时器并触发首次迁移与清理', async () => {
    jest.useFakeTimers();
    try {
      const repairSpy = jest.spyOn(service, 'repairLegacyTextBucketStarts').mockResolvedValue(0);
      const autoMigrateSpy = jest.spyOn(service, 'autoMigrateLegacyTrafficLogs').mockResolvedValue(0);
      const runCleanupSpy = jest.spyOn(service, 'runCleanup').mockResolvedValue({
        deletedHourlyCount: 0,
        deletedLegacyCount: 0
      });

      service.onModuleInit();

      // 前进 15 秒触发启动首次修复、迁移与清理
      jest.advanceTimersByTime(15_000);
      expect(repairSpy).toHaveBeenCalledTimes(1);

      // 等待微任务 resolve
      await Promise.resolve();
      expect(autoMigrateSpy).toHaveBeenCalledTimes(1);

      await Promise.resolve();
      expect(runCleanupSpy).toHaveBeenCalledTimes(1);

      // 前进 12 小时触发定时清理
      jest.advanceTimersByTime(12 * 3600 * 1000);
      expect(runCleanupSpy).toHaveBeenCalledTimes(2);

      service.onModuleDestroy();
      jest.advanceTimersByTime(12 * 3600 * 1000);
      expect(runCleanupSpy).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('repairLegacyTextBucketStarts 能自动将存量 TEXT 记录平滑修复为 INTEGER 毫秒时间戳', async () => {
    telemetryPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([
        {
          id: 'text-row-1',
          bucketStart: '2026-09-18T06:00:00.000Z',
          nodeId: 'node-1',
          userId: 'user-1',
          lineId: 'line-1',
          proxyKeyId: '',
          upload: 100n,
          download: 200n,
          billedBytes: 300n
        },
        {
          id: 'text-row-2',
          bucketStart: '2026-09-18T07:00:00.000Z',
          nodeId: 'node-1',
          userId: 'user-1',
          lineId: 'line-1',
          proxyKeyId: '',
          upload: 50n,
          download: 50n,
          billedBytes: 100n
        }
      ])
      .mockResolvedValueOnce([]) // row-1 冲突检查：无冲突
      .mockResolvedValueOnce([{ id: 'existing-int-row' }]) // row-2 冲突检查：有冲突
      .mockResolvedValueOnce([]); // 第二轮循环：无剩余行

    const repaired = await service.repairLegacyTextBucketStarts(10);
    expect(repaired).toBe(2);
    // row-1 无冲突，直接更新 bucketStart 为数值
    expect(telemetryPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "TrafficHourlyMetric"'),
      new Date('2026-09-18T06:00:00.000Z').getTime(),
      'text-row-1'
    );
    // row-2 有冲突，合并累加并删除 text-row-2
    expect(telemetryPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('upload'),
      '50',
      '50',
      '100',
      'existing-int-row'
    );
    expect(telemetryPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM "TrafficHourlyMetric"'),
      'text-row-2'
    );
  });
});

