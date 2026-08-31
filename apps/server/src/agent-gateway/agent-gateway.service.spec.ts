import { Test } from '@nestjs/testing';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentGatewayService } from './agent-gateway.service';
import type { HeartbeatData } from './agent-message';

describe('AgentGatewayService', () => {
  let service: AgentGatewayService;
  const txNodeUpdate = jest.fn(async () => undefined);
  const txUserFindUnique = jest.fn();
  const txTrafficCreate = jest.fn(async () => undefined);
  const txUserUpdate = jest.fn(async () => undefined);
  const tx = { node: { update: txNodeUpdate }, user: { findUnique: txUserFindUnique, update: txUserUpdate }, trafficLog: { create: txTrafficCreate } };
  const prisma = {
    $transaction: jest.fn(async (callback: (value: typeof tx) => Promise<void>) => callback(tx)),
    node: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    user: { findMany: jest.fn() }
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ providers: [AgentGatewayService, { provide: PrismaService, useValue: prisma }] }).compile();
    service = moduleRef.get(AgentGatewayService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findMany.mockResolvedValue([]);
  });

  const user = { uuid: 'uuid-1', email: 'user@example.com', password: 'secret', isActive: true, expireAt: null, trafficLimitBytes: BigInt(1000), trafficUsedBytes: BigInt(0) };
  const vlessParams = { flow: 'xtls-rprx-vision', transport: { type: 'tcp' }, tls: { enabled: true, mode: 'reality', serverName: 'www.apple.com', reality: { dest: 'www.apple.com:443', serverNames: ['www.apple.com'], privateKey: 'private', publicKey: 'public', shortIds: ['sid'] } } };
  const line = (overrides: Record<string, unknown> = {}) => ({
    id: 'line-1', name: 'VLESS 线路', tag: null, listen: '0.0.0.0', type: 'DIRECT', relayMode: null, protocolType: 'VLESS', paramsJson: JSON.stringify(vlessParams),
    entryNodeId: 'node-1', entryPort: 24443, exitNodeId: 'node-1', exitPort: 24443, endpointOverrideEnabled: false, serverHost: null, serverPort: null, serverName: null, host: null,
    ...overrides, exitNode: { id: 'node-2', serverHost: '198.51.100.20' }
  });

  it('按 Line 顶层协议生成 VLESS、Hysteria2 与 Shadowsocks 入站', async () => {
    const lines = [
      line(),
      line({ id: 'line-hy2', protocolType: 'HYSTERIA2', entryPort: 24444, exitPort: 24444, paramsJson: JSON.stringify({ tls: { enabled: true, mode: 'tls', serverName: 'hy.example.com', certificatePath: '/c', keyPath: '/k' } }) }),
      line({ id: 'line-ss', protocolType: 'SHADOWSOCKS', entryPort: 24445, exitPort: 24445, paramsJson: JSON.stringify({ method: 'aes-256-gcm', password: 'shared' }) })
    ];
    prisma.node.findUnique.mockResolvedValue({ id: 'node-1', serverHost: '198.51.100.10', configOverride: null, entryLines: lines, exitLines: [] });
    prisma.user.findMany.mockResolvedValue([user]);
    const { singboxConfig } = await service.buildConfigSync('node-1');
    const inbounds = singboxConfig.inbounds as Array<Record<string, unknown>>;
    expect(inbounds).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'vless', listen_port: 24443 }),
      expect.objectContaining({ type: 'hysteria2', listen_port: 24444 }),
      expect.objectContaining({ type: 'shadowsocks', listen_port: 24445 })
    ]));
  });

  it('使用线路自定义监听地址和直连 Tag', async () => {
    const custom = line({ id: 'custom', tag: 'public-vless', listen: '127.0.0.1' });
    prisma.node.findUnique.mockResolvedValue({ id: 'node-1', serverHost: '198.51.100.10', configOverride: null, entryLines: [custom], exitLines: [] });
    prisma.user.findMany.mockResolvedValue([user]);
    const { singboxConfig } = await service.buildConfigSync('node-1');
    expect(singboxConfig.inbounds).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'vless', tag: 'public-vless', listen: '127.0.0.1', listen_port: 24443 })
    ]));
  });

  it('双节点盲转发在入口生成 direct，在出口生成协议入站', async () => {
    const relay = line({ id: 'blind', name: '盲转发', type: 'RELAY', relayMode: 'BLIND_FORWARD', entryNodeId: 'node-1', entryPort: 25001, exitNodeId: 'node-2', exitPort: 25002 });
    prisma.node.findUnique.mockResolvedValue({ id: 'node-1', serverHost: '198.51.100.10', configOverride: null, entryLines: [relay], exitLines: [] });
    const entryConfig = await service.buildConfigSync('node-1');
    expect(entryConfig.singboxConfig.inbounds).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'direct', listen_port: 25001, override_address: '198.51.100.20', override_port: 25002 })]));

    prisma.node.findUnique.mockResolvedValue({ id: 'node-2', serverHost: '198.51.100.20', configOverride: null, entryLines: [], exitLines: [{ ...relay, entryNode: { id: 'node-1' } }] });
    const exitConfig = await service.buildConfigSync('node-2');
    expect(exitConfig.singboxConfig.inbounds).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'vless', listen_port: 25002 })]));
  });

  it('协议代理中继生成协议入口、协议出口和路由规则', async () => {
    const relay = line({ id: 'proxy', tag: 'relay-proxy', type: 'RELAY', relayMode: 'PROTOCOL_PROXY', entryNodeId: 'node-1', entryPort: 25101, exitNodeId: 'node-2', exitPort: 25102 });
    prisma.node.findUnique.mockResolvedValue({ id: 'node-1', serverHost: '198.51.100.10', configOverride: null, entryLines: [relay], exitLines: [] });
    prisma.user.findMany.mockResolvedValue([user]);
    const { singboxConfig } = await service.buildConfigSync('node-1');
    expect(singboxConfig.inbounds).toEqual(expect.arrayContaining([expect.objectContaining({ tag: 'relay-proxy-entry', listen_port: 25101 })]));
    expect(singboxConfig.outbounds).toEqual(expect.arrayContaining([expect.objectContaining({ tag: 'relay-out-proxy', server: '198.51.100.20', server_port: 25102, uuid: user.uuid })]));
    expect(singboxConfig.route).toEqual({ rules: [{ inbound: ['relay-proxy-entry'], outbound: 'relay-out-proxy' }] });
  });

  it('心跳遥测与流量扣减在同一事务内', async () => {
    txUserFindUnique.mockResolvedValue({ id: 'user-1', uuid: user.uuid });
    const heartbeat: HeartbeatData = { cpuUsage: 12, memoryUsage: 30, bandwidthRate: 512, trafficRecords: [{ userUuid: user.uuid, upload: 100, download: 200 }] };
    await service.handleHeartbeat('node-1', heartbeat);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(txTrafficCreate).toHaveBeenCalled();
    expect(txUserUpdate).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { trafficUsedBytes: { increment: BigInt(300) } } });
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
      trafficRecords: []
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
    await service.poll('token', { cpuUsage: 1, memoryUsage: 2, bandwidthRate: 3, trafficRecords: [] });
    expect(socket.close).toHaveBeenCalledWith(4002, 'switched to HTTP polling');
    expect(service.isCurrentSocket('poll-node', socket)).toBe(false);
  });

  it('HTTP 轮询只在配置版本落后时返回配置', async () => {
    (service as unknown as { configCache: Map<string, unknown> }).configCache.clear();
    prisma.node.findUnique
      .mockResolvedValueOnce({ id: 'poll-node', name: 'HTTP 节点', status: 'ONLINE' })
      .mockResolvedValueOnce({ id: 'poll-node', serverHost: '198.51.100.10', configOverride: null, entryLines: [], exitLines: [] })
      .mockResolvedValueOnce({ pollIntervalSecs: 15 });
    const first = await service.poll('token', { cpuUsage: 1, memoryUsage: 2, bandwidthRate: 3, trafficRecords: [] });
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
      trafficRecords: []
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
    const response = await service.poll('token', { cpuUsage: 1, memoryUsage: 2, bandwidthRate: 3, trafficRecords: [] });
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
      trafficRecords: [],
      agentVersion: '0.3.0',
      osArch: 'linux/amd64',
      kernelVersion: '1.11.0'
    });
    expect(txNodeUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ agentVersion: '0.3.0', osArch: 'linux/amd64', kernelVersion: '1.11.0' })
    }));
  });

  it('WS 与 HTTP 使用不同的离线窗口', async () => {
    prisma.node.findMany.mockResolvedValue([
      { id: 'ws-stale', communicationMode: 'WS', pollIntervalSecs: 15, lastSeenAt: new Date(Date.now() - 16_000) },
      { id: 'http-stale', communicationMode: 'HTTP', pollIntervalSecs: 15, lastSeenAt: new Date(Date.now() - 46_000) },
      { id: 'http-fresh', communicationMode: 'HTTP', pollIntervalSecs: 15, lastSeenAt: new Date(Date.now() - 44_000) }
    ]);
    await service.sweepStaleNodes();
    expect(prisma.node.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: expect.arrayContaining(['ws-stale', 'http-stale']) }, status: 'ONLINE' },
      data: { status: 'OFFLINE' }
    }));
  });
});
