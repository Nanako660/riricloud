import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentGatewayService } from '../agent-gateway/agent-gateway.service';
import { NodesService } from './nodes.service';

describe('NodesService', () => {
  let service: NodesService;
  const baseNode = { id: 'node-1', name: '东京节点', serverHost: '198.51.100.10', isLocal: false, configOverride: null, agentToken: 'token', status: 'ONLINE', lastSeenAt: null, cpuUsage: 1, memoryUsage: 2, bandwidthRate: 3, kernelRunning: true, configError: null, createdAt: new Date(), updatedAt: new Date() };
  const nodeWithLines = { ...baseNode, entryLines: [], exitLines: [] };
  const prisma = {
    node: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() }
  };
  const gateway = { pushConfig: jest.fn().mockResolvedValue(false), disconnectNode: jest.fn(), requestUpgrade: jest.fn(), requestProbe: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ providers: [NodesService, { provide: PrismaService, useValue: prisma }, { provide: AgentGatewayService, useValue: gateway }] }).compile();
    service = moduleRef.get(NodesService);
  });

  beforeEach(() => jest.clearAllMocks());

  it('节点列表返回线路反向列表和派生端口，而不是可编辑入站', async () => {
    const line = { id: 'line-1', name: '跨节点线路', type: 'RELAY', relayMode: 'BLIND_FORWARD', protocolType: 'VLESS', entryNodeId: baseNode.id, entryPort: 25001, exitNodeId: 'node-2', exitPort: 25002, serverHost: null, serverPort: null, trafficRate: 1, tagsJson: '[]', level: 0, sortOrder: 0, isPublic: true, status: 'ACTIVE', entryNode: baseNode, exitNode: { ...baseNode, id: 'node-2', name: '香港节点' } };
    prisma.node.findMany.mockResolvedValue([{ ...nodeWithLines, entryLines: [line] }]);
    const [result] = await service.list();
    expect(result.lines).toHaveLength(1);
    expect(result.servicePorts).toEqual(expect.arrayContaining([{ lineId: 'line-1', lineName: '跨节点线路', protocolType: 'VLESS', role: 'ENTRY', port: 25001 }]));
    expect(result).not.toHaveProperty('inbounds');
  });

  it('创建节点返回 AgentToken 与安装命令', async () => {
    prisma.node.create.mockResolvedValue(nodeWithLines);
    const result = await service.create({ name: '新节点', serverHost: '203.0.113.10' }, 'admin');
    expect(result.agentToken).toBe(baseNode.agentToken);
    expect(result.installCommand).toContain('--token=');
    expect(result.node).toHaveProperty('lines', []);
  });

  it('更新节点后触发配置推送', async () => {
    prisma.node.findUnique.mockResolvedValue(baseNode);
    prisma.node.update.mockResolvedValue(nodeWithLines);
    await service.update(baseNode.id, { name: '更新节点' });
    expect(gateway.pushConfig).toHaveBeenCalledWith(baseNode.id);
  });

  it('本机节点禁止删除', async () => {
    prisma.node.findUnique.mockResolvedValue({ ...baseNode, isLocal: true });
    await expect(service.remove(baseNode.id)).rejects.toThrow(ConflictException);
    expect(prisma.node.delete).not.toHaveBeenCalled();
  });

  it('节点不存在时抛出 NotFoundException', async () => {
    prisma.node.findUnique.mockResolvedValue(null);
    await expect(service.detail('missing')).rejects.toThrow(NotFoundException);
  });
});
