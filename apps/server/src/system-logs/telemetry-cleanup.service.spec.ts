import { PrismaService } from '../prisma/prisma.service';
import { TelemetryPrismaService } from '../prisma/telemetry-prisma.service';
import { SettingsService } from '../system/settings.service';
import { SystemLogsService } from './system-logs.service';
import { TelemetryCleanupService } from './telemetry-cleanup.service';

describe('TelemetryCleanupService', () => {
  const settings = {
    getSettings: jest.fn().mockResolvedValue({
      trafficHourlyRetentionDays: 90,
      nodeRateRetentionDays: 30,
      logsRetentionDays: 7,
      logsMaxCount: 100000
    })
  };
  const logs = { flush: jest.fn().mockResolvedValue(undefined), enqueue: jest.fn() };
  const telemetry = {
    trafficHourlyMetric: { count: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() },
    nodeRateMetric: { count: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() },
    systemLog: { count: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() }
  };
  const prisma = {
    trafficLog: { count: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() }
  };
  let service: TelemetryCleanupService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TelemetryCleanupService(
      prisma as unknown as PrismaService,
      telemetry as unknown as TelemetryPrismaService,
      settings as unknown as SettingsService,
      logs as unknown as SystemLogsService
    );
    telemetry.systemLog.count.mockResolvedValue(3);
    telemetry.systemLog.findFirst.mockResolvedValue({ createdAt: new Date('2026-01-01T00:00:00.000Z') });
    telemetry.systemLog.findMany.mockResolvedValue([]);
  });

  it('预览只统计选中的历史类型并返回范围信息', async () => {
    const result = await service.preview({ targets: [{ kind: 'systemLog', mode: 'all' }] });

    expect(result.items).toEqual([expect.objectContaining({
      kind: 'systemLog',
      mode: 'all',
      matchedCount: 3,
      estimatedBytes: 6144,
      oldest: '2026-01-01T00:00:00.000Z'
    })]);
    expect(telemetry.systemLog.deleteMany).not.toHaveBeenCalled();
  });

  it('执行清空系统日志后追加不可被本次清理删除的审计日志', async () => {
    telemetry.systemLog.deleteMany.mockResolvedValue({ count: 3 });

    const result = await service.execute(
      { targets: [{ kind: 'systemLog', mode: 'all' }], confirmationPhrase: 'CLEAR_HISTORY' },
      { id: 'admin-1', role: 'ADMIN', traceId: 'trace-1' }
    );

    expect(result.status).toBe('SUCCEEDED');
    expect(result.results).toEqual([expect.objectContaining({ kind: 'systemLog', matchedCount: 3, deletedCount: 3, success: true })]);
    expect(logs.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      module: 'TelemetryCleanup',
      userId: 'admin-1',
      bypassMinIngestLevel: true
    }));
    expect(logs.flush).toHaveBeenCalled();
  });

  it('缺少确认短语时拒绝执行并不触碰数据', async () => {
    await expect(service.execute({ targets: [{ kind: 'systemLog', mode: 'all' }] }, { id: 'admin-1' })).rejects.toThrow('CLEAR_HISTORY');
    expect(telemetry.systemLog.deleteMany).not.toHaveBeenCalled();
  });

  it('拒绝反向时间区间', async () => {
    await expect(service.preview({ targets: [{
      kind: 'trafficHourly',
      mode: 'range',
      from: '2026-01-02T00:00:00.000Z',
      to: '2026-01-01T00:00:00.000Z'
    }] })).rejects.toThrow('时间区间无效');
  });

  it('按当前系统日志策略同时考虑保留天数与最大记录数', async () => {
    telemetry.systemLog.count
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(100009)
      .mockResolvedValueOnce(100001);
    telemetry.systemLog.findFirst
      .mockResolvedValueOnce({ createdAt: new Date('2026-01-01T00:00:00.000Z') })
      .mockResolvedValueOnce({ createdAt: new Date('2026-01-08T00:00:00.000Z') })
      .mockResolvedValueOnce({ createdAt: new Date('2026-01-02T00:00:00.000Z') })
      .mockResolvedValueOnce({ createdAt: new Date('2026-01-03T00:00:00.000Z') });
    telemetry.systemLog.findMany.mockResolvedValue([{ id: 'oldest-log' }]);
    telemetry.systemLog.deleteMany
      .mockResolvedValueOnce({ count: 8 })
      .mockResolvedValueOnce({ count: 1 });

    const result = await service.execute(
      { targets: [{ kind: 'systemLog', mode: 'retention' }], confirmationPhrase: 'CLEAR_HISTORY' },
      { id: 'admin-1' }
    );

    expect(result.results[0]).toEqual(expect.objectContaining({ matchedCount: 9, deletedCount: 9 }));
    expect(telemetry.systemLog.deleteMany).toHaveBeenNthCalledWith(2, { where: { id: { in: ['oldest-log'] } } });
  });

  it('数量模式按稳定 ID 精确删除多余的旧记录', async () => {
    telemetry.nodeRateMetric.count
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2);
    telemetry.nodeRateMetric.findMany.mockResolvedValue([{ id: 'rate-1' }, { id: 'rate-2' }]);
    telemetry.nodeRateMetric.findFirst
      .mockResolvedValueOnce({ bucketStart: new Date('2026-01-01T00:00:00.000Z') })
      .mockResolvedValueOnce({ bucketStart: new Date('2026-01-02T00:00:00.000Z') });

    const result = await service.preview({ targets: [{ kind: 'nodeRate', mode: 'count', keepLatest: 2 }] });

    expect(result.items[0]).toEqual(expect.objectContaining({ matchedCount: 2, oldest: '2026-01-01T00:00:00.000Z' }));
    expect(telemetry.nodeRateMetric.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2 }));
  });

  it('支持获取数据库空间统计并执行 VACUUM 释放', async () => {
    const stats = await service.getDatabaseStats();
    expect(stats.databases).toHaveLength(2);
    expect(stats).toHaveProperty('totalBytes');

    const vacuumResult = await service.vacuumDatabases(['telemetry']);
    expect(vacuumResult.results).toHaveLength(1);
    expect(vacuumResult.results[0].target).toBe('telemetry');
    expect(vacuumResult).toHaveProperty('totalReclaimedBytes');
  });
});

