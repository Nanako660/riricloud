import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../system/settings.service';
import { LineSpeedtestService } from './line-speedtest.service';

describe('LineSpeedtestService', () => {
  let service: LineSpeedtestService;

  const entryNode = { id: 'node-1', name: '香港入口', serverHost: '1.2.3.4', status: 'ONLINE', isLocal: false };
  const exitNode = { id: 'node-2', name: '香港出口', serverHost: '1.2.3.5', status: 'ONLINE', isLocal: false };

  const rawLine = {
    id: 'line-1',
    name: '香港直连 01',
    tag: 'hk-direct-01',
    listen: '0.0.0.0',
    type: 'DIRECT',
    relayMode: null,
    protocolType: 'VLESS',
    paramsJson: JSON.stringify({ transport: { type: 'tcp' } }),
    entryNodeId: entryNode.id,
    entryPort: 20001,
    landingNodeId: exitNode.id,
    landingPort: 20001,
    targetLineId: null,
    certificateId: null,
    endpointOverrideEnabled: false,
    serverHost: null,
    serverPort: null,
    serverName: null,
    host: null,
    trafficRate: 1,
    tagsJson: '["hk"]',
    level: 0,
    sortOrder: 0,
    isPublic: true,
    status: 'ACTIVE',
    lastLatencyMs: null,
    lastTestedAt: null,
    lastTestStatus: null,
    lastTestMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    entryNode,
    exitNode
  };

  const prisma = {
    line: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn()
    }
  };

  const settingsService = {
    getSettings: jest.fn().mockResolvedValue({
      lineSpeedtestEnabled: true,
      lineSpeedtestIntervalMins: 30,
      lineSpeedtestTargetUrl: 'http://cp.cloudflare.com/generate_204',
      lineSpeedtestTimeoutMs: 3000
    })
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        LineSpeedtestService,
        { provide: PrismaService, useValue: prisma },
        { provide: SettingsService, useValue: settingsService }
      ]
    }).compile();

    service = moduleRef.get(LineSpeedtestService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    service.onModuleDestroy();
  });

  it('当线路不存在时抛出 NotFoundException', async () => {
    prisma.line.findUnique.mockResolvedValue(null);
    await expect(service.testLine('non-existent')).rejects.toThrow(NotFoundException);
  });

  it('测试线路成功时更新 Line 记录的延迟与状态', async () => {
    prisma.line.findUnique.mockResolvedValue(rawLine);
    prisma.line.update.mockResolvedValue({ ...rawLine, lastLatencyMs: 45, lastTestStatus: 'SUCCESS' });

    // Mock tcpPing 避免真实网络拨号
    const tcpPingSpy = jest.spyOn(service as unknown as { tcpPing: (...args: unknown[]) => Promise<number> }, 'tcpPing')
      .mockResolvedValue(45);

    const result = await service.testLine(rawLine.id);

    expect(result.status).toBe('SUCCESS');
    expect(result.latencyMs).toBe(45);
    expect(result.lineId).toBe(rawLine.id);
    expect(prisma.line.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: rawLine.id },
        data: expect.objectContaining({
          lastLatencyMs: 45,
          lastTestStatus: 'SUCCESS'
        })
      })
    );

    tcpPingSpy.mockRestore();
  });

  it('测试超时或网络错误时正确持久化 TIMEOUT 状态并清空 latency', async () => {
    prisma.line.findUnique.mockResolvedValue(rawLine);
    prisma.line.update.mockResolvedValue({ ...rawLine, lastLatencyMs: null, lastTestStatus: 'TIMEOUT' });

    const tcpPingSpy = jest.spyOn(service as unknown as { tcpPing: (...args: unknown[]) => Promise<number> }, 'tcpPing')
      .mockRejectedValue(new Error('连接超时（3000ms）'));

    const result = await service.testLine(rawLine.id);

    expect(result.status).toBe('TIMEOUT');
    expect(result.latencyMs).toBeNull();
    expect(prisma.line.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: rawLine.id },
        data: expect.objectContaining({
          lastLatencyMs: null,
          lastTestStatus: 'TIMEOUT'
        })
      })
    );

    tcpPingSpy.mockRestore();
  });

  it('批量测试所有已启用线路', async () => {
    const lines = [
      { id: 'line-1', name: 'Line 1' },
      { id: 'line-2', name: 'Line 2' }
    ];
    prisma.line.findMany.mockResolvedValue(lines);

    const testLineSpy = jest.spyOn(service, 'testLine').mockResolvedValue({
      lineId: 'line-1',
      lineName: 'Line 1',
      latencyMs: 60,
      status: 'SUCCESS',
      message: 'TCP 握手 (60ms)',
      testedAt: new Date(),
      mode: 'TCP_HANDSHAKE'
    });

    const summary = await service.testAllActiveLines();

    expect(summary.total).toBe(2);
    expect(summary.success).toBe(2);
    expect(testLineSpy).toHaveBeenCalledTimes(2);

    testLineSpy.mockRestore();
  });

  it('当线路为 Hysteria 2 纯 UDP 且端到端探测失败时，跳过 TCP 握手降级', async () => {
    const hy2Line = {
      ...rawLine,
      id: 'line-hy2',
      protocolType: 'HYSTERIA2'
    };
    prisma.line.findUnique.mockResolvedValue(hy2Line);
    prisma.line.update.mockResolvedValue({ ...hy2Line, lastLatencyMs: null, lastTestStatus: 'TIMEOUT' });

    type MockableSpeedtest = {
      resolveSingboxBinary: () => Promise<string | null>;
      runSingboxProbe: (...args: unknown[]) => Promise<number>;
      tcpPing: (...args: unknown[]) => Promise<number>;
    };

    jest.spyOn(service as unknown as MockableSpeedtest, 'resolveSingboxBinary').mockResolvedValue('/usr/local/bin/sing-box');
    const runSingboxProbeSpy = jest.spyOn(service as unknown as MockableSpeedtest, 'runSingboxProbe')
      .mockRejectedValue(new Error('代理探测连接超时（3000ms）'));
    const tcpPingSpy = jest.spyOn(service as unknown as MockableSpeedtest, 'tcpPing');

    const result = await service.testLine(hy2Line.id);

    expect(result.status).toBe('TIMEOUT');
    expect(result.mode).toBe('END_TO_END');
    expect(result.message).toContain('代理探测连接超时');
    // 纯 UDP 线路绝不调用 tcpPing，避免报 ECONNREFUSED
    expect(tcpPingSpy).not.toHaveBeenCalled();

    runSingboxProbeSpy.mockRestore();
    tcpPingSpy.mockRestore();
  });

  it('当没有 sing-box 内核且线路为 Hysteria 2 纯 UDP 时，直接报错且不调用 tcpPing', async () => {
    const hy2Line = {
      ...rawLine,
      id: 'line-hy2',
      protocolType: 'HYSTERIA2'
    };
    prisma.line.findUnique.mockResolvedValue(hy2Line);
    prisma.line.update.mockResolvedValue({ ...hy2Line, lastLatencyMs: null, lastTestStatus: 'ERROR' });

    type MockableSpeedtest = {
      resolveSingboxBinary: () => Promise<string | null>;
      tcpPing: (...args: unknown[]) => Promise<number>;
    };

    jest.spyOn(service as unknown as MockableSpeedtest, 'resolveSingboxBinary').mockResolvedValue(null);
    const tcpPingSpy = jest.spyOn(service as unknown as MockableSpeedtest, 'tcpPing');

    const result = await service.testLine(hy2Line.id);

    expect(result.status).toBe('ERROR');
    expect(result.message).toContain('纯 UDP');
    expect(tcpPingSpy).not.toHaveBeenCalled();

    tcpPingSpy.mockRestore();
  });

  it('当 Master 本机节点测试失败时，在错误信息中追加诊断提示', async () => {
    const localLine = {
      ...rawLine,
      id: 'line-local',
      protocolType: 'HYSTERIA2',
      entryNode: { ...entryNode, isLocal: true }
    };
    prisma.line.findUnique.mockResolvedValue(localLine);
    prisma.line.update.mockResolvedValue({ ...localLine, lastLatencyMs: null, lastTestStatus: 'ERROR' });

    type MockableSpeedtest = {
      resolveSingboxBinary: () => Promise<string | null>;
    };

    jest.spyOn(service as unknown as MockableSpeedtest, 'resolveSingboxBinary').mockResolvedValue(null);

    const result = await service.testLine(localLine.id);

    expect(result.status).toBe('ERROR');
    expect(result.message).toContain('Master 本机节点');
  });
});
