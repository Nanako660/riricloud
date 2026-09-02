import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TrafficService } from './traffic.service';

describe('TrafficService', () => {
  const prisma = {
    trafficLog: { findMany: jest.fn() },
    line: { findMany: jest.fn(), count: jest.fn() },
    user: { findUnique: jest.fn(), count: jest.fn() },
    node: { findMany: jest.fn() },
    nodeRateMetric: { findMany: jest.fn() }
  };
  let service: TrafficService;

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-02T12:34:00Z'));
    service = new TrafficService(prisma as unknown as PrismaService);
  });

  afterAll(() => jest.useRealTimers());

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.trafficLog.findMany.mockResolvedValue([]);
    prisma.line.findMany.mockResolvedValue([]);
    prisma.line.count.mockResolvedValue(0);
    prisma.user.count.mockResolvedValue(0);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.node.findMany.mockResolvedValue([]);
    prisma.nodeRateMetric.findMany.mockResolvedValue([]);
  });

  const line = (overrides: Record<string, unknown> = {}) => ({
    id: 'line-1',
    name: '香港 Premium',
    protocolType: 'VLESS',
    type: 'DIRECT',
    trafficRate: 1.5,
    ...overrides
  });

  it('今日按小时分桶并为无数据时隙补零', async () => {
    prisma.line.count.mockResolvedValue(2);
    prisma.user.count.mockResolvedValue(3);
    prisma.trafficLog.findMany.mockResolvedValue([
      { nodeId: 'node-1', userId: 'user-1', upload: 100n, download: 300n, recordedAt: new Date('2026-09-02T01:15:00+08:00'), line: line() },
      { nodeId: 'node-1', userId: 'user-2', upload: 50n, download: 50n, recordedAt: new Date('2026-09-02T03:05:00+08:00'), line: line({ id: 'line-2', name: '日本 CN2', trafficRate: 2 }) }
    ]);

    const result = await service.getOverview('today');

    expect(result.bucketType).toBe('hour');
    expect(result.timeSeries).toHaveLength(24);
    expect(result.timeSeries[0].total).toBe(0);
    expect(result.timeSeries[1]).toMatchObject({ upload: 100, download: 300, total: 400, billedTotal: 600 });
    expect(result.timeSeries[2].total).toBe(0);
    expect(result.timeSeries[3]).toMatchObject({ total: 100, billedTotal: 200 });
    expect(result.summary).toMatchObject({ totalUpload: 150, totalDownload: 350, totalPhysical: 500, totalBilled: 800, activeLinesCount: 2, activeUsersCount: 2 });
    expect(result.lineRankings.map((item) => item.lineName)).toEqual(['香港 Premium', '日本 CN2']);
    expect(result.lineRankings.map((item) => item.percentage)).toEqual([80, 20]);
  });

  it('overview 返回在线节点当前速率与历史平均/峰值', async () => {
    prisma.node.findMany.mockResolvedValue([
      { status: 'ONLINE', lastSeenAt: new Date('2026-09-02T12:33:59Z'), uploadRate: 1000, downloadRate: 2000 },
      { status: 'ONLINE', lastSeenAt: new Date('2026-09-02T12:30:00Z'), uploadRate: 9000, downloadRate: 9000 }
    ]);
    prisma.nodeRateMetric.findMany.mockResolvedValue([
      { nodeId: 'node-1', bucketStart: new Date('2026-09-02T12:25:00Z'), sampleCount: 1, uploadRateSum: 100, downloadRateSum: 200, uploadRatePeak: 100, downloadRatePeak: 200 },
      { nodeId: 'node-1', bucketStart: new Date('2026-09-02T12:30:00Z'), sampleCount: 2, uploadRateSum: 200, downloadRateSum: 600, uploadRatePeak: 150, downloadRatePeak: 400 },
      { nodeId: 'node-2', bucketStart: new Date('2026-09-02T12:30:00Z'), sampleCount: 1, uploadRateSum: 300, downloadRateSum: 100, uploadRatePeak: 300, downloadRatePeak: 120 }
    ]);

    const result = await service.getOverview('today');
    const currentBucket = result.rateSeries.find((point) => point.timestamp === '2026-09-02T12:30:00.000Z');

    expect(result.rate).toMatchObject({
      currentUploadRate: 1000,
      currentDownloadRate: 2000,
      averageUploadRate: 150,
      averageDownloadRate: 225,
      peakUploadRate: 450,
      peakDownloadRate: 520,
      unit: 'bytes/s',
      scope: 'node-network'
    });
    expect(currentBucket).toMatchObject({ uploadRate: 166.67, downloadRate: 233.33, peakUploadRate: 450, peakDownloadRate: 520, sampleCount: 3 });
  });

  it('7 天按天分桶并回退历史未分配记录到节点首选线路', async () => {
    prisma.line.count.mockResolvedValue(1);
    prisma.trafficLog.findMany.mockResolvedValue([
      { nodeId: 'node-1', userId: 'user-1', upload: 10n, download: 20n, recordedAt: new Date('2026-08-31T04:00:00Z'), line: null }
    ]);
    prisma.line.findMany.mockResolvedValue([{ ...line(), entryNodeId: 'node-1' }]);

    const result = await service.getOverview('7d');

    expect(result.bucketType).toBe('day');
    expect(result.timeSeries).toHaveLength(7);
    expect(result.timeSeries.every((point) => point.timestamp.length === 10)).toBe(true);
    expect(result.lineRankings[0]).toMatchObject({ lineId: 'line-1', lineName: '香港 Premium', total: 30, billedTotal: 45 });
    expect(result.summary.activeLinesCount).toBe(1);
  });

  it('用户明细只聚合指定用户并返回当前配额画像', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: 'USER',
      isActive: true,
      trafficLimitBytes: 1000n,
      trafficUsedBytes: 400n,
      expireAt: new Date('2026-10-01T00:00:00Z'),
      subscription: {
        trafficLimitBytes: 2000n,
        trafficUsedBytes: 600n,
        expireAt: new Date('2026-10-15T00:00:00Z'),
        plan: { name: '体验套餐' }
      }
    });
    prisma.trafficLog.findMany.mockResolvedValue([
      { nodeId: 'node-1', userId: 'user-1', upload: 100n, download: 200n, recordedAt: new Date('2026-09-02T01:00:00+08:00'), line: line() }
    ]);

    const result = await service.getUserDetail('user-1', 'today');

    expect(result.quota).toMatchObject({ trafficLimitBytes: 2000, trafficUsedBytes: 600, remainingBytes: 1400, planName: '体验套餐' });
    expect(result.summary).toMatchObject({ periodUpload: 100, periodDownload: 200, periodTotal: 300, periodBilled: 450 });
    expect(result.lineBreakdown).toHaveLength(1);
    expect(result.lineBreakdown[0].lineId).toBe('line-1');
    expect(prisma.trafficLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'user-1' }) }));
  });

  it('查询不存在用户时抛出 NotFoundException', async () => {
    await expect(service.getUserDetail('missing', 'today')).rejects.toThrow(NotFoundException);
  });
});
