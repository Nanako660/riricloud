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
      findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), updateMany: jest.fn()
    },
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
    prisma.line.findMany.mockResolvedValue([]);
    prisma.node.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => where.id === entryNode.id ? entryNode : where.id === exitNode.id ? exitNode : null);
  });

  const rawLine = {
    id: 'line-1', name: '东京 VLESS', tag: 'tokyo-vless', listen: '0.0.0.0', type: 'DIRECT', relayMode: null, protocolType: 'VLESS',
    paramsJson: JSON.stringify({ flow: 'xtls-rprx-vision', transport: { type: 'tcp' }, tls: { enabled: true, mode: 'reality', serverName: 'www.apple.com', reality: { dest: 'www.apple.com:443', serverNames: ['www.apple.com'], privateKey: 'private', publicKey: 'public', shortIds: ['sid'] } } }),
    entryNodeId: entryNode.id, entryPort: 24443, exitNodeId: entryNode.id, exitPort: 24443,
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

  it('套餐线路匹配只返回公开、启用且入口出口均在线的线路', async () => {
    prisma.line.findMany.mockResolvedValue([rawLine, { ...rawLine, id: 'offline', exitNode: { ...exitNode, status: 'OFFLINE' } }]);
    const result = await service.getAvailableForPlan({ lineMatchMode: 'TAGS', lineTagsJson: '["premium"]', lineIdsJson: '[]' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(rawLine.id);
  });

  it('线路不存在时抛出 NotFoundException', async () => {
    prisma.line.findUnique.mockResolvedValue(null);
    await expect(service.detail('missing')).rejects.toThrow(NotFoundException);
  });
});
