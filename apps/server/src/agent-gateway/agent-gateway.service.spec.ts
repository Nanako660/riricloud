import { Test } from '@nestjs/testing';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  INTERNAL_RELAY_TRANSIT_EMAIL,
  INTERNAL_RELAY_TRANSIT_SECRET,
  INTERNAL_RELAY_TRANSIT_UUID
} from '../common/constants';
import { AgentGatewayService } from './agent-gateway.service';
import type { HeartbeatData } from './agent-message';

describe('AgentGatewayService', () => {
  let service: AgentGatewayService;
  const txUserFindMany = jest.fn();
  const txTrafficCreateMany = jest.fn(async () => undefined);
  const txUserUpdate = jest.fn(async () => undefined);
  const txSubscriptionFindMany = jest.fn();
  const txSubscriptionUpdate = jest.fn(async () => undefined);
  const txSubscriptionUpdateMany = jest.fn(async () => ({ count: 0 }));
  const txTrafficCursorFindMany = jest.fn();
  const txTrafficCursorUpsert = jest.fn(async () => undefined);
  const txRateFindUnique = jest.fn();
  const txRateCreate = jest.fn(async () => undefined);
  const txRateUpdate = jest.fn(async () => undefined);
  const tx = {
    user: { findMany: txUserFindMany, update: txUserUpdate },
    trafficLog: { createMany: txTrafficCreateMany },
    subscription: { findMany: txSubscriptionFindMany, update: txSubscriptionUpdate, updateMany: txSubscriptionUpdateMany },
    trafficCursor: { findMany: txTrafficCursorFindMany, upsert: txTrafficCursorUpsert },
    nodeRateMetric: { findUnique: txRateFindUnique, create: txRateCreate, update: txRateUpdate }
  };
  const deploymentFindUnique = jest.fn();
  const deploymentFindFirst = jest.fn();
  const deploymentFindMany = jest.fn();
  const deploymentCreate = jest.fn();
  const deploymentUpdate = jest.fn();
  const prisma = {
    $transaction: jest.fn(async (callback: (value: typeof tx) => Promise<void>) => callback(tx)),
    node: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    user: { findMany: jest.fn() },
    line: { findFirst: jest.fn() },
    nodeRateMetric: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    binaryDeploymentTask: {
      findUnique: deploymentFindUnique,
      findFirst: deploymentFindFirst,
      findMany: deploymentFindMany,
      create: deploymentCreate,
      update: deploymentUpdate
    }
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ providers: [AgentGatewayService, { provide: PrismaService, useValue: prisma }] }).compile();
    service = moduleRef.get(AgentGatewayService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findMany.mockResolvedValue([]);
    txUserFindMany.mockResolvedValue([]);
    txSubscriptionFindMany.mockResolvedValue([]);
    txSubscriptionUpdateMany.mockResolvedValue({ count: 0 });
    txTrafficCursorFindMany.mockResolvedValue([]);
    txRateFindUnique.mockResolvedValue(null);
    prisma.line.findFirst.mockResolvedValue(null);
    deploymentFindUnique.mockResolvedValue(null);
    deploymentFindFirst.mockResolvedValue(null);
    deploymentFindMany.mockResolvedValue([]);
    deploymentCreate.mockResolvedValue(undefined);
    deploymentUpdate.mockResolvedValue(undefined);
    (service as unknown as { nextRateMetricCleanupAt: number }).nextRateMetricCleanupAt = 0;
  });

  const user = { uuid: 'uuid-1', email: 'user@example.com', password: 'secret', isActive: true, expireAt: null, trafficLimitBytes: BigInt(1000), trafficUsedBytes: BigInt(0) };
  const vlessParams = { flow: 'xtls-rprx-vision', transport: { type: 'tcp' }, tls: { enabled: true, mode: 'reality', serverName: 'www.apple.com', reality: { dest: 'www.apple.com:443', serverNames: ['www.apple.com'], privateKey: 'private', publicKey: 'public', shortIds: ['sid'] } } };
  const line = (overrides: Record<string, unknown> = {}) => ({
    id: 'line-1', name: 'VLESS 线路', tag: null, listen: '0.0.0.0', type: 'DIRECT', relayMode: null, protocolType: 'VLESS', paramsJson: JSON.stringify(vlessParams),
    entryNodeId: 'node-1', entryPort: 24443, exitNodeId: 'node-1', exitPort: 24443, targetLineId: null, endpointOverrideEnabled: false, serverHost: null, serverPort: null, serverName: null, host: null,
    status: 'ACTIVE',
    ...overrides, exitNode: { id: 'node-2', serverHost: '198.51.100.20', status: 'ONLINE' }
  });

  it('按 Line 顶层协议生成 VLESS、Hysteria2 与 Shadowsocks 入站', async () => {
    const lines = [
      line(),
      line({ id: 'line-hy2', protocolType: 'HYSTERIA2', entryPort: 24444, exitPort: 24444, paramsJson: JSON.stringify({ tls: { enabled: true, mode: 'tls', serverName: 'hy.example.com', certificatePath: '/c', keyPath: '/k' } }) }),
      line({ id: 'line-ss', protocolType: 'SHADOWSOCKS', entryPort: 24445, exitPort: 24445, paramsJson: JSON.stringify({ method: 'aes-256-gcm', password: 'shared' }) }),
      line({
        id: 'line-shadowtls',
        protocolType: 'SHADOWTLS',
        entryPort: 24446,
        exitPort: 24446,
        paramsJson: JSON.stringify({
          version: 3,
          handshakeDest: 'gateway.example.com:443',
          strictMode: true,
          inner: { type: 'SHADOWSOCKS', method: '2022-blake3-aes-128-gcm', password: 'inner-password' }
        })
      })
    ];
    prisma.node.findUnique.mockResolvedValue({ id: 'node-1', serverHost: '198.51.100.10', status: 'ONLINE', configOverride: null, entryLines: lines, exitLines: [] });
    prisma.user.findMany.mockResolvedValue([user]);
    const { singboxConfig } = await service.buildConfigSync('node-1');
    const inbounds = singboxConfig.inbounds as Array<Record<string, unknown>>;
    expect(singboxConfig.experimental).toEqual({
      v2ray_api: {
        listen: '127.0.0.1:10085',
        stats: {
          enabled: true,
          users: ['user@example.com'],
          inbounds: ['line-line-1', 'line-line-hy2', 'line-line-ss', 'line-line-shadowtls', 'line-line-shadowtls-inner']
        }
      }
    });
    expect(inbounds).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'vless', listen_port: 24443 }),
      expect.objectContaining({ type: 'hysteria2', listen_port: 24444 }),
      expect.objectContaining({ type: 'shadowsocks', listen_port: 24445 }),
      expect.objectContaining({ type: 'shadowtls', listen_port: 24446, detour: expect.stringContaining('-inner') }),
      expect.objectContaining({ type: 'shadowsocks', listen: '127.0.0.1', listen_port: 0, tag: expect.stringContaining('-inner') })
    ]));
  });

  it('配置同步读取证书关联中的最新 PEM 并以内嵌数组下发', async () => {
    const managed = line({
      id: 'managed-tls',
      protocolType: 'HYSTERIA2',
      entryPort: 24447,
      exitPort: 24447,
      paramsJson: JSON.stringify({ tls: { enabled: true, mode: 'tls', serverName: 'example.com' } }),
      certificate: { certificatePem: 'CERTIFICATE PEM', privateKeyPem: 'PRIVATE KEY PEM' }
    });
    prisma.node.findUnique.mockResolvedValue({ id: 'node-1', serverHost: '198.51.100.10', status: 'ONLINE', configOverride: null, entryLines: [managed], exitLines: [] });
    prisma.user.findMany.mockResolvedValue([user]);

    const { singboxConfig } = await service.buildConfigSync('node-1');
    const managedInbound = (singboxConfig.inbounds as Array<Record<string, unknown>>).find((inbound) => inbound.tag === 'line-managed-tls');
    expect(managedInbound?.tls).toEqual({
      enabled: true,
      server_name: 'example.com',
      certificate: ['CERTIFICATE PEM'],
      key: ['PRIVATE KEY PEM']
    });
  });

  it('使用线路自定义监听地址和直连 Tag', async () => {
    const custom = line({ id: 'custom', tag: 'public-vless', listen: '127.0.0.1' });
    prisma.node.findUnique.mockResolvedValue({ id: 'node-1', serverHost: '198.51.100.10', status: 'ONLINE', configOverride: null, entryLines: [custom], exitLines: [] });
    prisma.user.findMany.mockResolvedValue([user]);
    const { singboxConfig } = await service.buildConfigSync('node-1');
    expect(singboxConfig.inbounds).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'vless', tag: 'public-vless', listen: '127.0.0.1', listen_port: 24443 })
    ]));
  });

  it('双节点盲转发在入口生成 direct，在出口生成协议入站', async () => {
    const relay = line({ id: 'blind', name: '盲转发', type: 'RELAY', relayMode: 'BLIND_FORWARD', entryNodeId: 'node-1', entryPort: 25001, exitNodeId: 'node-2', exitPort: 25002 });
    prisma.node.findUnique.mockResolvedValue({ id: 'node-1', serverHost: '198.51.100.10', status: 'ONLINE', configOverride: null, entryLines: [relay], exitLines: [] });
    const entryConfig = await service.buildConfigSync('node-1');
    expect(entryConfig.singboxConfig.inbounds).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'direct', listen_port: 25001, override_address: '198.51.100.20', override_port: 25002 })]));

    prisma.node.findUnique.mockResolvedValue({ id: 'node-2', serverHost: '198.51.100.20', status: 'ONLINE', configOverride: null, entryLines: [], exitLines: [{ ...relay, entryNode: { id: 'node-1', status: 'ONLINE' } }] });
    const exitConfig = await service.buildConfigSync('node-2');
    expect(exitConfig.singboxConfig.inbounds).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'vless', listen_port: 25002 })]));
  });

  it('协议代理中继生成协议入口、协议出口和路由规则', async () => {
    const relay = line({ id: 'proxy', tag: 'relay-proxy', type: 'RELAY', relayMode: 'PROTOCOL_PROXY', entryNodeId: 'node-1', entryPort: 25101, exitNodeId: 'node-2', exitPort: 25102 });
    prisma.node.findUnique.mockResolvedValue({ id: 'node-1', serverHost: '198.51.100.10', status: 'ONLINE', configOverride: null, entryLines: [relay], exitLines: [] });
    prisma.user.findMany.mockResolvedValue([user]);
    const { singboxConfig } = await service.buildConfigSync('node-1');
    expect(singboxConfig.inbounds).toEqual(expect.arrayContaining([expect.objectContaining({ tag: 'relay-proxy-entry', listen_port: 25101 })]));
    expect(singboxConfig.outbounds).toEqual(expect.arrayContaining([expect.objectContaining({ tag: 'relay-out-proxy', server: '198.51.100.20', server_port: 25102, uuid: INTERNAL_RELAY_TRANSIT_UUID })]));
    expect(singboxConfig.route).toEqual({ rules: [{ inbound: ['relay-proxy-entry'], outbound: 'relay-out-proxy' }] });

    prisma.node.findUnique.mockResolvedValue({
      id: 'node-2',
      serverHost: '198.51.100.20',
      status: 'ONLINE',
      configOverride: null,
      entryLines: [],
      exitLines: [{ ...relay, entryNode: { id: 'node-1', status: 'ONLINE' } }]
    });
    const exitConfig = await service.buildConfigSync('node-2');
    expect(exitConfig.singboxConfig.inbounds).toEqual(expect.arrayContaining([
      expect.objectContaining({
        tag: 'relay-proxy-exit',
        users: [{ uuid: INTERNAL_RELAY_TRANSIT_UUID, name: INTERNAL_RELAY_TRANSIT_EMAIL, flow: 'xtls-rprx-vision' }]
      })
    ]));
    expect((exitConfig.singboxConfig.experimental as { v2ray_api: { stats: { users: string[] } } }).v2ray_api.stats.users)
      .toContain(INTERNAL_RELAY_TRANSIT_EMAIL);
  });

  it('目标线路桥接生成入口协议、目标协议出口，并复用目标直连入站', async () => {
    const targetParams = { tls: { enabled: true, mode: 'tls', serverName: 'target.example.com' }, upMbps: 100, downMbps: 500 };
    const targetLine = line({
      id: 'target',
      name: '落地 Hysteria2',
      type: 'DIRECT',
      relayMode: null,
      protocolType: 'HYSTERIA2',
      paramsJson: JSON.stringify(targetParams),
      entryNodeId: 'node-2',
      entryPort: 25002,
      exitNodeId: 'node-2',
      exitPort: 25002,
      relaySources: [{ id: 'bridge', tagsJson: '[]', isPublic: true, status: 'ACTIVE' }],
      exitNode: { id: 'node-2', serverHost: '198.51.100.20', status: 'ONLINE' }
    });
    const bridge = line({
      id: 'bridge',
      name: 'VLESS 转 Hysteria2',
      tag: 'relay-bridge',
      type: 'RELAY',
      relayMode: 'TARGET_LINE',
      protocolType: 'VLESS',
      entryNodeId: 'node-1',
      entryPort: 25001,
      exitNodeId: 'node-2',
      exitPort: 25002,
      targetLineId: 'target',
      targetLine: {
        id: 'target',
        type: 'DIRECT',
        protocolType: 'HYSTERIA2',
        paramsJson: JSON.stringify(targetParams),
        entryPort: 25002,
        status: 'ACTIVE',
        entryNode: { serverHost: '198.51.100.20' }
      },
      exitNode: { id: 'node-2', serverHost: '198.51.100.20', status: 'ONLINE' }
    });

    prisma.node.findUnique.mockResolvedValueOnce({
      id: 'node-1', serverHost: '198.51.100.10', status: 'ONLINE', configOverride: null, entryLines: [bridge], exitLines: []
    });
    prisma.user.findMany.mockResolvedValue([user]);
    const entryConfig = await service.buildConfigSync('node-1');
    expect(entryConfig.singboxConfig.inbounds).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'vless', tag: 'relay-bridge-entry', listen_port: 25001 })
    ]));
    expect(entryConfig.singboxConfig.outbounds).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'hysteria2', tag: 'relay-out-bridge', server: '198.51.100.20', server_port: 25002, password: INTERNAL_RELAY_TRANSIT_SECRET })
    ]));
    expect(entryConfig.singboxConfig.route).toEqual({ rules: [{ inbound: ['relay-bridge-entry'], outbound: 'relay-out-bridge' }] });

    prisma.node.findUnique.mockResolvedValueOnce({
      id: 'node-2', serverHost: '198.51.100.20', status: 'ONLINE', configOverride: null, entryLines: [targetLine], exitLines: [{ ...bridge, entryNode: { id: 'node-1', status: 'ONLINE' } }]
    });
    const exitConfig = await service.buildConfigSync('node-2');
    expect(exitConfig.singboxConfig.inbounds).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'hysteria2',
        listen_port: 25002,
        users: expect.arrayContaining([
          { name: user.email, password: user.password },
          { name: INTERNAL_RELAY_TRANSIT_EMAIL, password: INTERNAL_RELAY_TRANSIT_SECRET }
        ])
      })
    ]));
    expect(exitConfig.singboxConfig.inbounds).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ listen_port: 25002, tag: 'relay-bridge-exit' })
    ]));
  });

  it('心跳遥测独立落库，流量账务在单独事务内完成', async () => {
    txUserFindMany.mockResolvedValue([{ id: 'user-1', uuid: user.uuid, email: user.email }]);
    prisma.line.findFirst.mockResolvedValue({ id: 'line-1' });
    const heartbeat: HeartbeatData = { protocolVersion: 2, cpuUsage: 12, memoryUsage: 30, bandwidthRate: 512, trafficSnapshots: [{ userUuid: user.uuid, uploadTotal: '100', downloadTotal: '200' }] };
    await service.handleHeartbeat('node-1', heartbeat);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.node.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'node-1' },
      data: expect.objectContaining({ cpuUsage: 12, memoryUsage: 30, bandwidthRate: 512 })
    }));
    expect(txTrafficCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ nodeId: 'node-1', userId: 'user-1', lineId: 'line-1', upload: BigInt(100), download: BigInt(200), recordedAt: expect.any(Date) })]
    });
    expect(txUserUpdate).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { trafficUsedBytes: { increment: BigInt(300) } } });
    expect(txSubscriptionUpdate).not.toHaveBeenCalled();
  });

  it('新 Agent 心跳落库上下行速率并写入五分钟聚合桶', async () => {
    await service.handleHeartbeat('node-1', {
      cpuUsage: 12,
      memoryUsage: 30,
      bandwidthRate: 460,
      uploadRate: 120,
      downloadRate: 340,
      protocolVersion: 2,
      trafficSnapshots: []
    });
    await (service as unknown as { flushRateMetrics: () => Promise<void> }).flushRateMetrics();
    expect(prisma.node.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ uploadRate: 120, downloadRate: 340, bandwidthRate: 460 })
    }));
    expect(txRateCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        nodeId: 'node-1',
        bucketStart: expect.any(Date),
        sampleCount: 1,
        uploadRateSum: 120,
        downloadRateSum: 340,
        uploadRatePeak: 120,
        downloadRatePeak: 340
      })
    });
    expect(prisma.nodeRateMetric.deleteMany).not.toHaveBeenCalled();
  });

  it('订阅存在时扣减 Subscription 并同步 User 镜像', async () => {
    txUserFindMany.mockResolvedValue([{ id: 'user-1', uuid: user.uuid, email: user.email }]);
    prisma.line.findFirst.mockResolvedValue({ id: 'line-1' });
    txSubscriptionFindMany.mockResolvedValue([{ id: 'sub-1', userId: 'user-1' }]);
    const heartbeat: HeartbeatData = {
      cpuUsage: 12,
      memoryUsage: 30,
      bandwidthRate: 512,
      protocolVersion: 2,
      trafficSnapshots: [{ userUuid: user.uuid, uploadTotal: '4503599627370497', downloadTotal: '4503599627370498' }]
    };
    await service.handleHeartbeat('node-1', heartbeat);
    expect(txSubscriptionUpdate).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: { trafficUsedBytes: { increment: BigInt('9007199254740995') } }
    });
    expect(txUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { trafficUsedBytes: { increment: BigInt('9007199254740995') } }
    });
  });

  it('盲转发出口节点优先回退到承载线路并按线路倍率扣费', async () => {
    txUserFindMany.mockResolvedValue([{ id: 'user-1', uuid: user.uuid, email: user.email }]);
    prisma.line.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'blind-line', trafficRate: 1.5 });
    txTrafficCursorFindMany.mockResolvedValue([]);

    await service.handleHeartbeat('node-2', {
      protocolVersion: 2,
      cpuUsage: 1,
      memoryUsage: 2,
      bandwidthRate: 3,
      trafficSnapshots: [{ userUuid: user.uuid, uploadTotal: '100', downloadTotal: '50' }]
    });

    expect(txTrafficCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ nodeId: 'node-2', lineId: 'blind-line', upload: 100n, download: 50n })]
    });
    expect(txUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { trafficUsedBytes: { increment: 225n } }
    });
  });

  it('内部中继凭证只更新游标，不创建流水或扣减任何用户配额', async () => {
    txTrafficCursorFindMany.mockResolvedValue([
      { credential: INTERNAL_RELAY_TRANSIT_EMAIL, uploadTotal: 100n, downloadTotal: 100n },
      { credential: INTERNAL_RELAY_TRANSIT_UUID, uploadTotal: 100n, downloadTotal: 100n }
    ]);

    await service.handleHeartbeat('node-2', {
      protocolVersion: 2,
      cpuUsage: 1,
      memoryUsage: 2,
      bandwidthRate: 3,
      trafficSnapshots: [
        { userUuid: INTERNAL_RELAY_TRANSIT_EMAIL, uploadTotal: '10', downloadTotal: '20' },
        { userUuid: INTERNAL_RELAY_TRANSIT_UUID, uploadTotal: '30', downloadTotal: '40' }
      ]
    });

    expect(txTrafficCreateMany).not.toHaveBeenCalled();
    expect(txUserUpdate).not.toHaveBeenCalled();
    expect(txSubscriptionUpdate).not.toHaveBeenCalled();
    expect(txTrafficCursorUpsert).toHaveBeenCalledTimes(2);
    expect(txTrafficCursorUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { nodeId_credential: { nodeId: 'node-2', credential: INTERNAL_RELAY_TRANSIT_EMAIL } },
      update: { uploadTotal: 10n, downloadTotal: 20n }
    }));
    expect((service as unknown as { trafficCounterResetCount: number }).trafficCounterResetCount).toBe(0);
  });

  it('心跳跨过流量周期边界时先重置再计入新周期，且只重置一次', async () => {
    txUserFindMany.mockResolvedValue([{ id: 'user-1', uuid: user.uuid, email: user.email }]);
    txTrafficCursorFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ credential: user.uuid, uploadTotal: 100n, downloadTotal: 200n }]);
    const now = new Date();
    const currentPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    txSubscriptionFindMany
      .mockResolvedValueOnce([{
        id: 'sub-1',
        userId: 'user-1',
        startedAt: new Date(now.getTime() - 45 * 86400000),
        trafficPeriodStartAt: new Date(currentPeriodStart.getTime() - 86400000),
        plan: { durationDays: 30, trafficResetMode: 'CALENDAR_MONTH' }
      }])
      .mockResolvedValueOnce([{
        id: 'sub-1',
        userId: 'user-1',
        startedAt: new Date(now.getTime() - 45 * 86400000),
        trafficPeriodStartAt: currentPeriodStart,
        plan: { durationDays: 30, trafficResetMode: 'CALENDAR_MONTH' }
      }]);
    txSubscriptionUpdateMany.mockResolvedValue({ count: 1 });

    await service.handleHeartbeat('node-1', {
      protocolVersion: 2,
      cpuUsage: 1,
      memoryUsage: 2,
      bandwidthRate: 3,
      trafficSnapshots: [{ userUuid: user.uuid, uploadTotal: '100', downloadTotal: '200' }]
    });
    await service.handleHeartbeat('node-1', {
      protocolVersion: 2,
      cpuUsage: 1,
      memoryUsage: 2,
      bandwidthRate: 3,
      trafficSnapshots: [{ userUuid: user.uuid, uploadTotal: '101', downloadTotal: '200' }]
    });

    expect(txSubscriptionUpdateMany).toHaveBeenCalledTimes(1);
    expect(txSubscriptionUpdateMany).toHaveBeenCalledWith({
      where: { id: 'sub-1', trafficPeriodStartAt: expect.any(Date) },
      data: { trafficPeriodStartAt: expect.any(Date), trafficUsedBytes: BigInt(0) }
    });
    expect(txUserUpdate).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { trafficUsedBytes: BigInt(0) } });
    expect(txSubscriptionUpdate).toHaveBeenCalledWith({ where: { id: 'sub-1' }, data: { trafficUsedBytes: { increment: BigInt(1) } } });
    expect(txUserUpdate).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { trafficUsedBytes: { increment: BigInt(1) } } });
  });

  it('累计快照只按游标差额计费，重复快照不会重复扣减', async () => {
    txUserFindMany.mockResolvedValue([{ id: 'user-1', uuid: user.uuid, email: user.email }]);
    txTrafficCursorFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ credential: user.uuid, uploadTotal: 100n, downloadTotal: 200n }]);

    await service.handleHeartbeat('node-1', {
      protocolVersion: 2,
      cpuUsage: 1,
      memoryUsage: 2,
      bandwidthRate: 3,
      trafficSnapshots: [{ userUuid: user.uuid, uploadTotal: '100', downloadTotal: '200' }]
    });
    txTrafficCreateMany.mockClear();
    txUserUpdate.mockClear();
    txTrafficCursorUpsert.mockClear();

    await service.handleHeartbeat('node-1', {
      protocolVersion: 2,
      cpuUsage: 1,
      memoryUsage: 2,
      bandwidthRate: 3,
      trafficSnapshots: [{ userUuid: user.uuid, uploadTotal: '100', downloadTotal: '200' }]
    });
    expect(txTrafficCreateMany).not.toHaveBeenCalled();
    expect(txUserUpdate).not.toHaveBeenCalled();
    expect(txTrafficCursorUpsert).toHaveBeenCalledTimes(1);
  });

  it('累计快照支持丢失中间样本并处理单方向计数器重置', async () => {
    txUserFindMany.mockResolvedValue([{ id: 'user-1', uuid: user.uuid, email: user.email }]);
    txTrafficCursorFindMany.mockResolvedValue([
      { credential: user.uuid, uploadTotal: 1000n, downloadTotal: 2000n }
    ]);
    await service.handleHeartbeat('node-1', {
      protocolVersion: 2,
      cpuUsage: 1,
      memoryUsage: 2,
      bandwidthRate: 3,
      trafficSnapshots: [{ userUuid: user.uuid, uploadTotal: '25', downloadTotal: '2500' }]
    });
    expect(txTrafficCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ upload: 25n, download: 500n })]
    });
  });

  it('未知凭证只建立游标基线，之后只计入新增流量', async () => {
    txUserFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'user-1', uuid: user.uuid, email: user.email }]);
    txTrafficCursorFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ credential: user.uuid, uploadTotal: 100n, downloadTotal: 200n }]);

    await service.handleHeartbeat('node-1', {
      protocolVersion: 2,
      cpuUsage: 1,
      memoryUsage: 2,
      bandwidthRate: 3,
      trafficSnapshots: [{ userUuid: user.uuid, uploadTotal: '100', downloadTotal: '200' }]
    });
    expect(txTrafficCreateMany).not.toHaveBeenCalled();

    await service.handleHeartbeat('node-1', {
      protocolVersion: 2,
      cpuUsage: 1,
      memoryUsage: 2,
      bandwidthRate: 3,
      trafficSnapshots: [{ userUuid: user.uuid, uploadTotal: '150', downloadTotal: '250' }]
    });
    expect(txTrafficCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ upload: 50n, download: 50n })]
    });
  });

  it('不同节点的累计游标相互隔离', async () => {
    txUserFindMany.mockResolvedValue([{ id: 'user-1', uuid: user.uuid, email: user.email }]);
    txTrafficCursorFindMany.mockResolvedValue([]);
    await Promise.all([
      service.handleHeartbeat('node-1', {
        protocolVersion: 2,
        cpuUsage: 1,
        memoryUsage: 2,
        bandwidthRate: 3,
        trafficSnapshots: [{ userUuid: user.uuid, uploadTotal: '100', downloadTotal: '0' }]
      }),
      service.handleHeartbeat('node-2', {
        protocolVersion: 2,
        cpuUsage: 1,
        memoryUsage: 2,
        bandwidthRate: 3,
        trafficSnapshots: [{ userUuid: user.uuid, uploadTotal: '100', downloadTotal: '0' }]
      })
    ]);
    expect(txTrafficCreateMany).toHaveBeenCalledTimes(2);
  });

  it('同一节点的并发心跳按顺序执行', async () => {
    let releaseFirst!: () => void;
    const firstUpdate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const nodeUpdate = prisma.node.update as jest.Mock;
    nodeUpdate.mockImplementationOnce(async () => firstUpdate);

    const first = service.handleHeartbeat('node-serial', {
      cpuUsage: 1,
      memoryUsage: 2,
      bandwidthRate: 3,
      protocolVersion: 2,
      trafficSnapshots: []
    });
    await new Promise((resolve) => setImmediate(resolve));
    const second = service.handleHeartbeat('node-serial', {
      cpuUsage: 4,
      memoryUsage: 5,
      bandwidthRate: 6,
      protocolVersion: 2,
      trafficSnapshots: []
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(nodeUpdate).toHaveBeenCalledTimes(1);

    releaseFirst();
    await Promise.all([first, second]);
    expect(nodeUpdate).toHaveBeenCalledTimes(2);
  });

  it('速率历史清理按低频周期执行', async () => {
    const deleteMany = prisma.nodeRateMetric.deleteMany as jest.Mock;
    deleteMany.mockResolvedValue({ count: 3 });

    await service.cleanupOldRateMetrics();
    await service.cleanupOldRateMetrics();

    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith({ where: { bucketStart: { lt: expect.any(Date) } } });
  });

  it('节点不存在时配置同步抛出 NotFoundException', async () => {
    prisma.node.findUnique.mockResolvedValue(null);
    await expect(service.buildConfigSync('missing')).rejects.toThrow(NotFoundException);
  });

  it('HTTP 轮询鉴权失败时拒绝请求', async () => {
    prisma.node.findUnique.mockResolvedValue(null);
    await expect(service.poll('bad-token', {
      cpuUsage: 1,
      memoryUsage: 2,
      bandwidthRate: 3,
      protocolVersion: 2,
      trafficSnapshots: []
    })).rejects.toThrow(UnauthorizedException);
  });

  it('HTTP 轮询接入会淘汰同节点旧 WS 连接', async () => {
    const socket = { send: jest.fn(), close: jest.fn() };
    prisma.node.update.mockResolvedValue(undefined);
    prisma.node.findUnique
      .mockResolvedValueOnce({ id: 'poll-node', name: 'HTTP 节点', status: 'OFFLINE' })
      .mockResolvedValueOnce({ id: 'poll-node', name: 'HTTP 节点', status: 'ONLINE' })
      .mockResolvedValueOnce({ id: 'poll-node', serverHost: '198.51.100.10', configOverride: null, entryLines: [], exitLines: [] })
      .mockResolvedValueOnce({ pollIntervalSecs: 15 });
    await service.register('poll-node', socket);
    await service.poll('token', { protocolVersion: 2, cpuUsage: 1, memoryUsage: 2, bandwidthRate: 3, trafficSnapshots: [] });
    expect(socket.close).toHaveBeenCalledWith(4002, 'switched to HTTP polling');
    expect(service.isCurrentSocket('poll-node', socket)).toBe(false);
  });

  it('HTTP 轮询只在配置版本落后时返回配置', async () => {
    (service as unknown as { configCache: Map<string, unknown> }).configCache.clear();
    prisma.node.findUnique
      .mockResolvedValueOnce({ id: 'poll-node', name: 'HTTP 节点', status: 'ONLINE' })
      .mockResolvedValueOnce({ id: 'poll-node', serverHost: '198.51.100.10', configOverride: null, entryLines: [], exitLines: [] })
      .mockResolvedValueOnce({ pollIntervalSecs: 15 });
    const first = await service.poll('token', { protocolVersion: 2, cpuUsage: 1, memoryUsage: 2, bandwidthRate: 3, trafficSnapshots: [] });
    expect(first.needUpdate).toBe(true);
    expect(first.singboxConfig).toEqual(expect.objectContaining({ inbounds: [] }));
    expect(first.nextPollSecs).toBe(15);

    prisma.node.findUnique
      .mockResolvedValueOnce({ id: 'poll-node', name: 'HTTP 节点', status: 'ONLINE' })
      .mockResolvedValueOnce({ pollIntervalSecs: 30 });
    const second = await service.poll('token', {
      cpuUsage: 1,
      memoryUsage: 2,
      bandwidthRate: 3,
      appliedConfigVersion: first.version,
      protocolVersion: 2,
      trafficSnapshots: []
    });
    expect(second.needUpdate).toBe(false);
    expect(second.singboxConfig).toBeNull();
    expect(second.nextPollSecs).toBe(30);
  });

  it('HTTP 节点任务进入队列并在回执后完成', async () => {
    prisma.node.findUnique.mockResolvedValue({ id: 'http-task-node', status: 'ONLINE', communicationMode: 'HTTP' });
    const requested = await service.requestProbe('http-task-node', [{ type: 'dns', target: 'example.com' }]);
    expect(requested.requested).toBe(true);

    (service as unknown as { configCache: Map<string, unknown> }).configCache.clear();
    prisma.node.findUnique
      .mockResolvedValueOnce({ id: 'http-task-node', name: 'HTTP 任务节点', status: 'ONLINE' })
      .mockResolvedValueOnce({ id: 'http-task-node', serverHost: '198.51.100.11', configOverride: null, entryLines: [], exitLines: [] })
      .mockResolvedValueOnce({ pollIntervalSecs: 15 });
    const response = await service.poll('token', { protocolVersion: 2, cpuUsage: 1, memoryUsage: 2, bandwidthRate: 3, trafficSnapshots: [] });
    expect(response.tasks).toHaveLength(1);
    const taskId = response.tasks[0].data.taskId;

    await service.handleProbeResult('http-task-node', {
      taskId,
      success: true,
      results: [{ type: 'dns', target: 'example.com', success: true, latencyMs: 2 }]
    });
    expect(service.getTaskStatus('http-task-node', taskId)).toEqual(expect.objectContaining({ status: 'COMPLETED', success: true }));
  });

  it('探针回执持久化最近一次结果快照', async () => {
    await service.handleProbeResult('node-1', {
      taskId: 'probe-1',
      success: false,
      results: [{ type: 'dns', target: 'example.com', success: true, latencyMs: 8, addresses: ['93.184.216.34'], packetLossPercent: 0 }]
    });
    expect(prisma.node.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'node-1' },
      data: { lastProbeResult: expect.stringContaining('93.184.216.34') }
    }));
  });

  it('心跳回执落库 Agent 版本与系统架构画像', async () => {
    await service.handleHeartbeat('node-1', {
      cpuUsage: 12,
      memoryUsage: 30,
      bandwidthRate: 512,
      protocolVersion: 2,
      trafficSnapshots: [],
      agentVersion: '0.3.0',
      osArch: 'linux/amd64',
      kernelVersion: '1.11.0'
    });
    expect(prisma.node.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ agentVersion: '0.3.0', osArch: 'linux/amd64', kernelVersion: '1.11.0' })
    }));
  });

  it('WS 与 HTTP 使用不同的离线窗口', async () => {
    const wsLastSeenAt = new Date(Date.now() - 16_000);
    const httpLastSeenAt = new Date(Date.now() - 46_000);
    const httpFreshLastSeenAt = new Date(Date.now() - 44_000);
    prisma.node.findMany.mockResolvedValue([
      { id: 'ws-stale', communicationMode: 'WS', pollIntervalSecs: 15, lastSeenAt: wsLastSeenAt },
      { id: 'http-stale', communicationMode: 'HTTP', pollIntervalSecs: 15, lastSeenAt: httpLastSeenAt },
      { id: 'http-fresh', communicationMode: 'HTTP', pollIntervalSecs: 15, lastSeenAt: httpFreshLastSeenAt }
    ]);
    await service.sweepStaleNodes();
    expect(prisma.node.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [
          { id: 'ws-stale', status: 'ONLINE', lastSeenAt: wsLastSeenAt },
          { id: 'http-stale', status: 'ONLINE', lastSeenAt: httpLastSeenAt }
        ]
      },
      data: { status: 'OFFLINE', bandwidthRate: null, uploadRate: null, downloadRate: null }
    }));
  });

  it('写入失败时保留最新心跳并安排指数退避重试', async () => {
    prisma.node.update.mockRejectedValue(new Error('database is busy'));

    await expect(service.handleHeartbeat('retry-node', {
      protocolVersion: 2,
      cpuUsage: 1,
      memoryUsage: 2,
      bandwidthRate: 3,
      trafficSnapshots: []
    })).rejects.toThrow('database is busy');

    const pending = (service as unknown as { pendingHeartbeats: Map<string, { data: HeartbeatData }> }).pendingHeartbeats;
    expect(pending.get('retry-node')?.data.cpuUsage).toBe(1);

    service.onModuleDestroy();
    prisma.node.update.mockResolvedValue(undefined);
  });

  it('持久化升级任务在 Master 重启后仍可查询', async () => {
    const task = {
      id: 'task-persisted',
      nodeId: 'node-1',
      assetId: 'asset-1',
      previousAssetId: null,
      releaseId: 'release-1',
      kind: 'SINGBOX',
      operation: 'UPGRADE',
      status: 'DISPATCHED',
      attempts: 1,
      payloadJson: JSON.stringify({ taskId: 'task-persisted', target: 'singbox', version: '1.14.0-r1', url: 'https://panel.example.com/binary', sha256: 'a'.repeat(64) }),
      errorMessage: null,
      requestedById: 'admin-1',
      requestedAt: new Date('2026-09-03T10:00:00.000Z'),
      dispatchedAt: new Date('2026-09-03T10:00:01.000Z'),
      completedAt: null
    };
    deploymentFindFirst.mockResolvedValue(task);

    const restarted = new AgentGatewayService(prisma as never);
    try {
      const result = await restarted.getPersistedTaskStatus('node-1', 'task-persisted');
      expect(result).toEqual(expect.objectContaining({
        taskId: 'task-persisted',
        status: 'DISPATCHED',
        attempts: 1,
        requestedAt: task.requestedAt,
        dispatchedAt: task.dispatchedAt
      }));
    } finally {
      restarted.onModuleDestroy();
    }
  });

  it('升级失败回执持久化为 FAILED 且不会被内存状态误报为完成', async () => {
    const task = {
      id: 'task-failed',
      nodeId: 'node-1',
      assetId: 'asset-1',
      previousAssetId: null,
      releaseId: 'release-1',
      kind: 'SINGBOX',
      operation: 'UPGRADE',
      status: 'DISPATCHED',
      attempts: 1,
      payloadJson: '{}',
      errorMessage: null,
      requestedById: null,
      requestedAt: new Date(),
      dispatchedAt: new Date(),
      completedAt: null
    };
    deploymentFindFirst.mockResolvedValue(task);
    prisma.node.update.mockResolvedValue(undefined);

    await service.handleUpgradeResult('node-1', {
      taskId: task.id,
      target: 'singbox',
      version: '1.14.0-r1',
      success: false,
      message: '启动验证失败'
    });

    expect(deploymentUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: task.id },
      data: expect.objectContaining({ status: 'FAILED', errorMessage: '启动验证失败' })
    }));
    expect(service.getTaskStatus('node-1', task.id)).toEqual(expect.objectContaining({ status: 'FAILED', success: false }));
  });

  it('资源升级任务包含完整文件包并在 HTTP 节点离线时保留为持久待执行任务', async () => {
    prisma.node.findUnique.mockResolvedValue({ status: 'ONLINE', communicationMode: 'HTTP' });
    const payload = {
      resourceId: 'release-1',
      assetId: 'asset-1',
      releaseId: 'release-1',
      files: [
        { name: 'sing-box', role: 'main' as const, url: 'https://panel.example.com/main', sha256: 'a'.repeat(64) },
        { name: 'libcronet.so', role: 'auxiliary' as const, url: 'https://panel.example.com/aux', sha256: 'b'.repeat(64) }
      ]
    };
    deploymentCreate.mockResolvedValue({ id: 'task-resource' });

    const result = await service.requestUpgrade('node-1', 'singbox', '1.14.0-r1', 'https://panel.example.com/main', 'a'.repeat(64), payload);

    expect(result.requested).toBe(true);
    expect(deploymentCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ assetId: 'asset-1', releaseId: 'release-1', status: 'QUEUED', payloadJson: expect.stringContaining('libcronet.so') })
    }));
  });
});
