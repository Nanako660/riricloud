import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_LEGACY_LOGS_RETENTION_DAYS,
  DEFAULT_TRAFFIC_RETENTION_DAYS,
  TrafficCleanupService
} from './traffic-cleanup.service';

interface MockPrisma {
  trafficHourlyMetric: {
    deleteMany: jest.Mock;
  };
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

describe('TrafficCleanupService', () => {
  const prisma: MockPrisma = {
    trafficHourlyMetric: {
      deleteMany: jest.fn()
    },
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

  let service: TrafficCleanupService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.trafficLog.count.mockResolvedValue(0);
    prisma.trafficLog.findMany.mockResolvedValue([]);
    prisma.line.findMany.mockResolvedValue([]);
    service = new TrafficCleanupService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('runCleanup 能够正确按 90 天清理小时时序并按 7 天清理旧 TrafficLog', async () => {
    prisma.trafficHourlyMetric.deleteMany.mockResolvedValue({ count: 42 });
    prisma.trafficLog.deleteMany.mockResolvedValue({ count: 15 });

    const fixedNow = new Date('2026-09-17T00:00:00.000Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(fixedNow);

    const result = await service.runCleanup();

    expect(result).toEqual({ deletedHourlyCount: 42, deletedLegacyCount: 15 });

    const expectedHourlyCutoff = new Date(fixedNow - DEFAULT_TRAFFIC_RETENTION_DAYS * 24 * 3600 * 1000);
    const expectedLegacyCutoff = new Date(fixedNow - DEFAULT_LEGACY_LOGS_RETENTION_DAYS * 24 * 3600 * 1000);

    expect(prisma.trafficHourlyMetric.deleteMany).toHaveBeenCalledWith({
      where: { bucketStart: { lt: expectedHourlyCutoff } }
    });
    expect(prisma.trafficLog.deleteMany).toHaveBeenCalledWith({
      where: { recordedAt: { lt: expectedLegacyCutoff } }
    });
  });

  it('runCleanup 在 Prisma 抛出异常时能安全捕获并返回 0', async () => {
    prisma.trafficHourlyMetric.deleteMany.mockRejectedValue(new Error('DB connection failed'));

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
    prisma.$executeRaw.mockResolvedValue(1);

    const migrated = await service.autoMigrateLegacyTrafficLogs(100);

    expect(migrated).toBe(2);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(prisma.trafficLog.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['log-1', 'log-2'] } }
    });
  });

  it('onModuleInit 与 onModuleDestroy 能够正常注册和注销定时器并触发首次迁移与清理', async () => {
    jest.useFakeTimers();
    try {
      const autoMigrateSpy = jest.spyOn(service, 'autoMigrateLegacyTrafficLogs').mockResolvedValue(0);
      const runCleanupSpy = jest.spyOn(service, 'runCleanup').mockResolvedValue({
        deletedHourlyCount: 0,
        deletedLegacyCount: 0
      });

      service.onModuleInit();

      // 前进 15 秒触发启动首次清理与迁移
      jest.advanceTimersByTime(15_000);
      expect(autoMigrateSpy).toHaveBeenCalledTimes(1);

      // 等待微任务 resolve
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
});
