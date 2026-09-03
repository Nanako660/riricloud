import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentGatewayService } from '../agent-gateway/agent-gateway.service';
import { LinesService } from './lines.service';

describe('LinesService', () => {
  let service: LinesService;
  const entryNode = { id: 'node-entry', name: '入口节点', serverHost: '198.51.100.10', status: 'ONLINE', isLocal: false };
  const exitNode = { id: 'node-exit', name: '出口节点', serverHost: '198.51.100.20', status: 'ONLINE', isLocal: false };
  const prisma = {
    line: {
      findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), updateMany: jest.fn()
    },
    certificate: { findUnique: jest.fn() },
    node: { findUnique: jest.fn() },
    $transaction: jest.fn(async (operations: unknown[]) => Promise.all(operations as Promise<unknown>[]))
  };
  const gateway = { pushConfigToAll: jest.fn().mockResolvedValue(0) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ providers: [LinesService, { provide: PrismaService, useValue: prisma }, { provide: AgentGatewayService, useValue: gateway }] }).compile();
    service = moduleRef.get(LinesService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (service as unknown as { processStartedAt: number }).processStartedAt = Date.now();
    prisma.line.findMany.mockResolvedValue([]);
    prisma.line.findFirst.mockResolvedValue(null);
    prisma.line.findUnique.mockReset();
    prisma.certificate.findUnique.mockResolvedValue(null);
    prisma.node.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => where.id === entryNode.id ? entryNode : where.id === exitNode.id ? exitNode : null);
  });

  const rawLine = {
    id: 'line-1', name: '东京 VLESS', tag: 'tokyo-vless', listen: '0.0.0.0', type: 'DIRECT', relayMode: null, protocolType: 'VLESS',
    paramsJson: JSON.stringify({ flow: 'xtls-rprx-vision', transport: { type: 'tcp' }, tls: { enabled: true, mode: 'reality', serverName: 'www.apple.com', reality: { dest: 'www.apple.com:443', serverNames: ['www.apple.com'], privateKey: 'private', publicKey: 'public', shortIds: ['sid'] } } }),
    entryNodeId: entryNode.id, entryPort: 24443, exitNodeId: entryNode.id, exitPort: 24443, targetLineId: null,
    certificateId: null, certificate: null,
    endpointOverrideEnabled: false, serverHost: null, serverPort: null, serverName: null, host: null, trafficRate: 1, tagsJson: '["premium"]', level: 0, sortOrder: 0, isPublic: true, status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date(), entryNode, exitNode: entryNode
  };

  it('创建直连线路时将协议参数归一化并自动绑定同一节点', async () => {
    prisma.line.create.mockResolvedValue(rawLine);
    const result = await service.create({ name: '东京 VLESS', tag: 'tokyo-vless', listen: '127.0.0.1', protocolType: 'VLESS', entryNodeId: entryNode.id, entryPort: 24443, params: { tls: { mode: 'reality' } } });
    expect(prisma.line.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'DIRECT', protocolType: 'VLESS', tag: 'tokyo-vless', listen: '127.0.0.1', entryNodeId: entryNode.id, exitNodeId: entryNode.id, entryPort: 24443, exitPort: 24443 }) }));
    const params = result.line.params as { tls?: { reality?: Record<string, unknown> } };
    expect(params.tls).toBeDefined();
    expect(params.tls?.reality).not.toHaveProperty('privateKey');
  });

  it('创建双节点盲转发线路时保存独立入口和出口端点', async () => {
    const relay = { ...rawLine, id: 'line-relay', name: '跨节点盲转', type: 'RELAY', relayMode: 'BLIND_FORWARD', entryNodeId: entryNode.id, entryPort: 25001, exitNodeId: exitNode.id, exitPort: 25002, entryNode, exitNode };
    prisma.line.create.mockResolvedValue(relay);
    const result = await service.create({ name: relay.name, type: 'RELAY', relayMode: 'BLIND_FORWARD', protocolType: 'VLESS', entryNodeId: entryNode.id, entryPort: 25001, exitNodeId: exitNode.id, exitPort: 25002 });
    expect(result.line.topology.entry.port).toBe(25001);
    expect(result.line.topology.exit.port).toBe(25002);
    expect(gateway.pushConfigToAll).toHaveBeenCalled();
  });

  it('桥接已有直连线路时自动复用目标节点和端口', async () => {
    const targetLine = { id: 'line-target', type: 'DIRECT', protocolType: 'SHADOWSOCKS', entryNodeId: exitNode.id, entryPort: 25002 };
    prisma.line.findUnique.mockResolvedValue(targetLine);
    const relay = { ...rawLine, id: 'line-bridge', name: '异构桥接', type: 'RELAY', relayMode: 'TARGET_LINE', protocolType: 'VLESS', entryNodeId: entryNode.id, entryPort: 25001, exitNodeId: exitNode.id, exitPort: 25002, targetLineId: targetLine.id, entryNode, exitNode };
    prisma.line.create.mockResolvedValue(relay);

    const result = await service.create({
      name: relay.name,
      type: 'RELAY',
      relayMode: 'TARGET_LINE',
      protocolType: 'VLESS',
      entryNodeId: entryNode.id,
      entryPort: 25001,
      exitNodeId: entryNode.id,
      exitPort: 29999,
      targetLineId: targetLine.id,
      params: { tls: { mode: 'reality' } }
    });

    expect(prisma.line.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        relayMode: 'TARGET_LINE',
        targetLineId: targetLine.id,
        exitNodeId: exitNode.id,
        exitPort: targetLine.entryPort
      })
    }));
    expect(result.line.targetLineId).toBe(targetLine.id);
  });

  it('桥接目标必须是其他节点上的直连且支持出站的线路', async () => {
    prisma.line.findUnique.mockResolvedValue({ id: 'relay-target', type: 'RELAY', protocolType: 'VLESS', entryNodeId: exitNode.id, entryPort: 25002 });
    await expect(service.create({
      name: '目标不是直连', type: 'RELAY', relayMode: 'TARGET_LINE', protocolType: 'VLESS',
      entryNodeId: entryNode.id, targetLineId: 'relay-target'
    })).rejects.toThrow('桥接目标必须是直连线路');

    prisma.line.findUnique.mockResolvedValue({ id: 'shadowtls-target', type: 'DIRECT', protocolType: 'SHADOWTLS', entryNodeId: exitNode.id, entryPort: 25002 });
    await expect(service.create({
      name: '目标协议不支持', type: 'RELAY', relayMode: 'TARGET_LINE', protocolType: 'VLESS',
      entryNodeId: entryNode.id, targetLineId: 'shadowtls-target'
    })).rejects.toThrow('目标线路协议不支持作为桥接出口');

    prisma.line.findUnique.mockResolvedValue({ id: 'same-node-target', type: 'DIRECT', protocolType: 'VLESS', entryNodeId: entryNode.id, entryPort: 25002 });
    await expect(service.create({
      name: '目标同节点', type: 'RELAY', relayMode: 'TARGET_LINE', protocolType: 'VLESS',
      entryNodeId: entryNode.id, targetLineId: 'same-node-target'
    })).rejects.toThrow('桥接目标必须位于其他节点');
  });

  it('关联证书时仅保存 certificateId，并允许标准 TLS 省略节点本地路径', async () => {
    prisma.certificate.findUnique.mockResolvedValue({
      id: 'certificate-1', certificatePem: 'CERTIFICATE PEM', privateKeyPem: 'PRIVATE KEY PEM'
    });
    prisma.line.create.mockResolvedValue({ ...rawLine, certificateId: 'certificate-1' });
    const result = await service.create({
      name: '带证书线路',
      protocolType: 'HYSTERIA2',
      entryNodeId: entryNode.id,
      entryPort: 24445,
      certificateId: 'certificate-1',
      params: { tls: { mode: 'tls', serverName: 'example.com' } }
    });
    const createCall = prisma.line.create.mock.calls[0][0] as { data: { certificateId: string; paramsJson: string } };
    expect(createCall.data.certificateId).toBe('certificate-1');
    expect(createCall.data.paramsJson).not.toContain('PRIVATE KEY PEM');
    expect(result.line.certificateId).toBe('certificate-1');
  });

  it('端口被同传输层线路占用时拒绝创建', async () => {
    prisma.line.findMany.mockResolvedValue([{ protocolType: 'VLESS' }]);
    await expect(service.create({ name: '冲突线路', protocolType: 'VLESS', entryNodeId: entryNode.id, entryPort: 24443 })).rejects.toThrow(ConflictException);
    expect(prisma.line.create).not.toHaveBeenCalled();
  });

  it('同节点中继线路不得复用相同的入口和出口端口', async () => {
    await expect(service.create({
      name: '同节点盲转',
      type: 'RELAY',
      relayMode: 'BLIND_FORWARD',
      protocolType: 'VLESS',
      entryNodeId: entryNode.id,
      entryPort: 25001,
      exitNodeId: entryNode.id,
      exitPort: 25001
    })).rejects.toThrow(BadRequestException);
    expect(prisma.line.create).not.toHaveBeenCalled();
  });

  it('ShadowTLS 不允许使用协议代理中继', async () => {
    await expect(service.create({
      name: 'ShadowTLS 协议代理',
      type: 'RELAY',
      relayMode: 'PROTOCOL_PROXY',
      protocolType: 'SHADOWTLS',
      entryNodeId: entryNode.id,
      entryPort: 25201,
      exitNodeId: exitNode.id,
      exitPort: 25202,
      params: {
        version: 3,
        handshakeDest: 'gateway.example.com:443',
        inner: { type: 'SHADOWSOCKS', method: '2022-blake3-aes-128-gcm', password: 'inner-password' }
      }
    })).rejects.toThrow('ShadowTLS 仅支持直连或盲转发');
    expect(prisma.line.create).not.toHaveBeenCalled();
  });

  it('套餐线路匹配只返回公开、启用且入口出口均在线的线路', async () => {
    prisma.line.findMany.mockResolvedValue([rawLine, { ...rawLine, id: 'offline', exitNode: { ...exitNode, status: 'OFFLINE' } }]);
    const result = await service.getAvailableForPlan({ lineMatchMode: 'TAGS', lineTagsJson: '["premium"]', lineIdsJson: '[]' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(rawLine.id);
  });

  it('Master 重启宽限期内保留最近失联节点的线路', async () => {
    const masterStartedAt = Date.now() - 20_000;
    const lastSeenAt = new Date(masterStartedAt - 10_000);
    (service as unknown as { processStartedAt: number }).processStartedAt = masterStartedAt;
    prisma.line.findMany.mockResolvedValue([{
      ...rawLine,
      exitNode: { ...exitNode, status: 'OFFLINE', lastSeenAt, communicationMode: 'WS', pollIntervalSecs: 15 }
    }]);

    const result = await service.getAvailableForPlan({ lineMatchMode: 'ALL', lineTagsJson: '[]', lineIdsJson: '[]' });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(rawLine.id);
    expect(result[0].exitNode).not.toHaveProperty('lastSeenAt');
  });

  it('套餐线路视图会解析对外端点覆盖', async () => {
    prisma.line.findMany.mockResolvedValue([{
      ...rawLine,
      endpointOverrideEnabled: true,
      serverHost: 'edge.example.com',
      serverPort: 8443,
      serverName: 'tls.example.com',
      host: 'cdn.example.com'
    }]);

    const result = await service.getAvailableForPlan({ lineMatchMode: 'ALL', lineTagsJson: '[]', lineIdsJson: '[]' });

    expect(result[0]).toMatchObject({
      serverHost: 'edge.example.com',
      serverPort: 8443,
      serverName: 'tls.example.com',
      host: 'cdn.example.com',
      endpointOverrides: {
        serverHost: 'edge.example.com',
        serverPort: 8443,
        serverName: 'tls.example.com',
        host: 'cdn.example.com'
      }
    });
  });

  it('目标直连线路禁用时不返回桥接中继线路', async () => {
    const bridge = { ...rawLine, id: 'bridge', type: 'RELAY', relayMode: 'TARGET_LINE', targetLineId: 'target', entryNode, exitNode, targetLine: { id: 'target', status: 'DISABLED' } };
    prisma.line.findMany.mockResolvedValue([bridge]);
    const result = await service.getAvailableForPlan({ lineMatchMode: 'ALL', lineTagsJson: '[]', lineIdsJson: '[]' });
    expect(result).toHaveLength(0);
  });

  it('删除被桥接引用的目标线路时拦截操作', async () => {
    prisma.line.findUnique.mockResolvedValue(rawLine);
    prisma.line.findFirst.mockResolvedValue({ id: 'bridge-line' });
    await expect(service.remove(rawLine.id)).rejects.toThrow('该线路正被其他中继线路作为出口目标引用');
    expect(prisma.line.delete).not.toHaveBeenCalled();
  });

  it('套餐线路与额外线路取并集，额外授权可包含隐藏线路但不放行禁用线路', async () => {
    const hidden = { ...rawLine, id: 'hidden', name: '隐藏线路', isPublic: false, tagsJson: '["internal"]' };
    const disabled = { ...rawLine, id: 'disabled', name: '禁用线路', isPublic: false, status: 'DISABLED' };
    prisma.line.findMany.mockResolvedValue([rawLine, hidden, disabled]);

    const result = await service.getAvailableForPlan(
      { lineMatchMode: 'TAGS', lineTagsJson: '["premium"]', lineIdsJson: '[]' },
      ['hidden', 'disabled']
    );

    expect(result.map((line) => line.id)).toEqual(['line-1', 'hidden']);
    expect(prisma.line.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        status: 'ACTIVE',
        OR: [{ isPublic: true }, { id: { in: ['hidden', 'disabled'] } }]
      }
    }));
  });

  it('线路不存在时抛出 NotFoundException', async () => {
    prisma.line.findUnique.mockResolvedValue(null);
    await expect(service.detail('missing')).rejects.toThrow(NotFoundException);
  });
});
