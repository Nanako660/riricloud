import { ConflictException } from '@nestjs/common';
import { AgentGatewayService } from '../agent-gateway/agent-gateway.service';
import { PrismaService } from '../prisma/prisma.service';
import { LinesService } from './lines.service';

describe('LinesService', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const targetNode = { id: 'n-target', name: '出口节点', serverHost: '203.0.113.10', status: 'ONLINE', isLocal: false };
  const entryNode = { id: 'n-entry', name: '入口节点', serverHost: '203.0.113.20', status: 'ONLINE', isLocal: false };
  const targetInbound = {
    id: 'i-target', nodeId: targetNode.id, type: 'VLESS', tag: 'vless-in', listen: '::', port: 443,
    paramsJson: JSON.stringify({ transport: { type: 'tcp' }, tls: { enabled: false, mode: 'none' } }),
    node: targetNode, createdAt: now, updatedAt: now
  };
  const rawLine = {
    id: 'l1', name: '线路一', type: 'DIRECT', relayMode: null, entryNodeId: targetNode.id, entryPort: null,
    targetInboundId: targetInbound.id, endpointOverrideEnabled: false, serverHost: null, serverPort: null, serverName: null, host: null,
    trafficRate: 1, tagsJson: '["vip"]', level: 1, sortOrder: 0, isPublic: true, status: 'ACTIVE',
    entryNode: targetNode, targetInbound, createdAt: now, updatedAt: now
  };
  const prisma = {
    line: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), updateMany: jest.fn() },
    node: { findUnique: jest.fn() },
    nodeInbound: { findUnique: jest.fn(), findFirst: jest.fn() },
    $transaction: jest.fn()
  };
  const gateway = { pushConfigToAll: jest.fn().mockResolvedValue(0) };
  const service = new LinesService(prisma as never as PrismaService, gateway as never as AgentGatewayService);

  afterEach(() => jest.clearAllMocks());

  it('创建中继线路省略入口端口时生成五位随机端口', async () => {
    prisma.nodeInbound.findUnique.mockResolvedValue(targetInbound);
    prisma.node.findUnique.mockResolvedValue(entryNode);
    prisma.nodeInbound.findFirst.mockResolvedValue(null);
    prisma.line.findFirst.mockResolvedValue(null);
    prisma.line.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...rawLine, ...data, entryNode })
    );

    await service.create({
      name: '随机入口', type: 'RELAY', relayMode: 'BLIND_FORWARD', entryNodeId: entryNode.id,
      targetInboundId: targetInbound.id
    });

    const created = prisma.line.create.mock.calls[0][0].data;
    expect(created.entryPort).toEqual(expect.any(Number));
    expect(created.entryPort).toBeGreaterThanOrEqual(20000);
    expect(created.entryPort).toBeLessThanOrEqual(29999);
  });

  it('创建中继线路时校验入口端口并持久化拓扑字段', async () => {
    prisma.nodeInbound.findUnique.mockResolvedValue(targetInbound);
    prisma.node.findUnique.mockResolvedValue(entryNode);
    prisma.nodeInbound.findFirst.mockResolvedValue(null);
    prisma.line.findFirst.mockResolvedValue(null);
    prisma.line.create.mockResolvedValue({ ...rawLine, type: 'RELAY', relayMode: 'BLIND_FORWARD', entryNodeId: entryNode.id, entryPort: 8443, entryNode });

    await service.create({
      name: '入口盲转', type: 'RELAY', relayMode: 'BLIND_FORWARD', entryNodeId: entryNode.id, entryPort: 8443,
      targetInboundId: targetInbound.id, tags: ['relay'], trafficRate: 1.5
    });

    expect(prisma.line.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'RELAY', relayMode: 'BLIND_FORWARD', entryNodeId: entryNode.id, entryPort: 8443, trafficRate: 1.5, tagsJson: '["relay"]' })
    }));
    expect(gateway.pushConfigToAll).toHaveBeenCalled();
  });

  it('入口端口与已有入站冲突时拒绝创建', async () => {
    prisma.nodeInbound.findUnique.mockResolvedValue(targetInbound);
    prisma.node.findUnique.mockResolvedValue(entryNode);
    prisma.nodeInbound.findFirst.mockResolvedValue({ id: 'conflict' });
    await expect(service.create({
      name: '冲突线路', type: 'RELAY', relayMode: 'BLIND_FORWARD', entryNodeId: entryNode.id, entryPort: 443,
      targetInboundId: targetInbound.id
    })).rejects.toThrow(ConflictException);
    expect(prisma.line.create).not.toHaveBeenCalled();
  });

  it('套餐线路匹配只返回公开、启用且底层在线的线路', async () => {
    prisma.line.findMany.mockResolvedValue([
      rawLine,
      { ...rawLine, id: 'l2', name: '离线线路', targetInbound: { ...targetInbound, node: { ...targetNode, status: 'OFFLINE' } } }
    ]);
    const result = await service.getAvailableForPlan({ lineMatchMode: 'TAGS', lineTagsJson: '["vip"]', lineIdsJson: '[]' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('l1');
    expect(result[0].targetInbound.node).toEqual(targetNode);
    expect(prisma.line.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isPublic: true, status: 'ACTIVE' } }));
  });

  it('默认复用线路类型对应的底层地址和端口，并保留原始覆盖字段', async () => {
    prisma.line.findUnique.mockResolvedValue({
      ...rawLine,
      serverHost: 'stale.example.com',
      serverPort: 9443,
      serverName: 'stale.example.com',
      host: 'stale-cdn.example.com'
    });

    const result = await service.detail(rawLine.id);

    expect(result.line).toMatchObject({
      endpointOverrideEnabled: false,
      serverHost: targetNode.serverHost,
      serverPort: targetInbound.port,
      serverName: null,
      host: null,
      endpointOverrides: {
        serverHost: 'stale.example.com',
        serverPort: 9443,
        serverName: 'stale.example.com',
        host: 'stale-cdn.example.com'
      }
    });
  });

  it('启用对外覆盖后使用自定义端点，同时保留覆盖值', async () => {
    prisma.line.findUnique.mockResolvedValue({
      ...rawLine,
      endpointOverrideEnabled: true,
      serverHost: 'edge.example.com',
      serverPort: 8443,
      serverName: 'www.apple.com',
      host: 'cdn.example.com'
    });

    const result = await service.detail(rawLine.id);

    expect(result.line).toMatchObject({
      endpointOverrideEnabled: true,
      serverHost: 'edge.example.com',
      serverPort: 8443,
      serverName: 'www.apple.com',
      host: 'cdn.example.com'
    });
    expect(result.line.endpointOverrides).toEqual({
      serverHost: 'edge.example.com',
      serverPort: 8443,
      serverName: 'www.apple.com',
      host: 'cdn.example.com'
    });
  });

  it('中继线路关闭覆盖时复用入口节点地址与入口端口', async () => {
    prisma.line.findUnique.mockResolvedValue({
      ...rawLine,
      type: 'RELAY',
      entryNodeId: entryNode.id,
      entryPort: 8443,
      entryNode,
      serverHost: 'stale.example.com',
      serverPort: 9443,
      endpointOverrideEnabled: false
    });

    const result = await service.detail(rawLine.id);

    expect(result.line).toMatchObject({
      serverHost: entryNode.serverHost,
      serverPort: 8443,
      endpointOverrideEnabled: false
    });
  });
});
