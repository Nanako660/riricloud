import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_LEGACY_LOGS_RETENTION_DAYS,
  DEFAULT_TRAFFIC_RETENTION_DAYS,
  TrafficCleanupService
} from './traffic-cleanup.service';

describe('TrafficCleanupService', () => {
  const prisma = {
    trafficHourlyMetric: {
      deleteMany: jest.fn()
    },
    trafficLog: {
      deleteMany: jest.fn()
    }
  };

  let service: TrafficCleanupService;

  beforeEach(() => {
    jest.clearAllMocks();
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

  it('onModuleInit 与 onModuleDestroy 能够正常注册和注销定时器', () => {
    jest.useFakeTimers();
    try {
      const runCleanupSpy = jest.spyOn(service, 'runCleanup').mockResolvedValue({
        deletedHourlyCount: 0,
        deletedLegacyCount: 0
      });

      service.onModuleInit();

      // 前进 15 秒触发启动首次清理
      jest.advanceTimersByTime(15_000);
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
