import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentGatewayService } from '../agent-gateway/agent-gateway.service';
import { BinariesService } from '../binaries/binaries.service';
import { NodesService } from './nodes.service';

describe('NodesService', () => {
  let service: NodesService;
  const baseNode = { id: 'node-1', name: '东京节点', serverHost: '198.51.100.10', isLocal: false, configOverride: null, agentToken: 'token', status: 'ONLINE', lastSeenAt: null, cpuUsage: 1, memoryUsage: 2, bandwidthRate: 3, kernelRunning: true, configError: null, lastProbeResult: null, agentVersion: null, osArch: null, kernelVersion: null, createdAt: new Date(), updatedAt: new Date() };
  const nodeWithLines = { ...baseNode, entryLines: [], exitLines: [] };
  const prisma = {
    node: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() }
  };
  const gateway = { pushConfig: jest.fn().mockResolvedValue(false), disconnectNode: jest.fn(), requestUpgrade: jest.fn(), requestProbe: jest.fn() };
  const binaries = { resolveForNode: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ providers: [NodesService, { provide: PrismaService, useValue: prisma }, { provide: AgentGatewayService, useValue: gateway }, { provide: BinariesService, useValue: binaries }] }).compile();
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

  it('创建节点返回使用当前访问域名的 AgentToken 与安装命令', async () => {
    prisma.node.create.mockResolvedValue(nodeWithLines);
    const result = await service.create({ name: '新节点', serverHost: '203.0.113.10' }, 'admin', 'https://panel.example.com');
    expect(result.agentToken).toBe(baseNode.agentToken);
    expect(result.installCommand).toContain('--token=');
    expect(result.installCommands.ws).toContain('https://panel.example.com/api/v1/downloads/agent');
    expect(result.installCommands.ws).toContain('--master=wss://panel.example.com/ws/agent');
    expect(result.installCommands.http).toContain('--master=https://panel.example.com');
    expect(result.installCommands.ws).not.toContain('<master-domain>');
    expect(result.node).toHaveProperty('lines', []);
  });

  it('节点详情按当前请求域名生成安装命令', async () => {
    prisma.node.findUnique.mockResolvedValue(nodeWithLines);
    const result = await service.detail(baseNode.id, 'https://panel.example.com');
    expect(result.node.installCommands.ws).toContain('https://panel.example.com/api/v1/downloads/agent');
    expect(result.node.installCommands.ws).toContain('--master=wss://panel.example.com/ws/agent');
  });

  it('未提供自定义地址时使用主控内置二进制', async () => {
    prisma.node.findUnique.mockResolvedValue({ ...baseNode, osArch: 'linux/amd64' });
    binaries.resolveForNode.mockResolvedValue({ version: '0.3.0', url: 'http://master/api/v1/downloads/binaries/agent-linux-amd64?token=token', sha256: 'a'.repeat(64) });
    gateway.requestUpgrade.mockResolvedValue({ taskId: 'task-1', requested: true });
    const result = await service.requestUpgrade(baseNode.id, { target: 'agent' });
    expect(binaries.resolveForNode).toHaveBeenCalledWith('agent', 'linux/amd64', baseNode.agentToken, undefined);
    expect(gateway.requestUpgrade).toHaveBeenCalledWith(baseNode.id, 'agent', '0.3.0', expect.stringContaining('/downloads/binaries/'), 'a'.repeat(64));
    expect(result).toEqual({ taskId: 'task-1', requested: true });
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
