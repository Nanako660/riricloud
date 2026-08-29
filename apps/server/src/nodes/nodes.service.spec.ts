import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AgentGatewayService } from '../agent-gateway/agent-gateway.service';
import { PrismaService } from '../prisma/prisma.service';
import { NodesService } from './nodes.service';

describe('NodesService', () => {
  let service: NodesService;
  const prisma = {
    node: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() }
  };
  const agentGateway = { pushConfig: jest.fn(), disconnectNode: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        NodesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AgentGatewayService, useValue: agentGateway }
      ]
    }).compile();
    service = moduleRef.get(NodesService);
  });

  afterEach(() => jest.clearAllMocks());

  const seededNode = {
    id: 'n1',
    name: '东京节点 01',
    serverHost: '203.0.113.10',
    serverPort: 443,
    protocol: 'VLESS_REALITY',
    configPayload: JSON.stringify({ privateKey: 'priv', publicKey: 'pub' }),
    agentToken: 'tok',
    status: 'ONLINE',
    isPublic: true
  };

  describe('update', () => {
    it('更新地址与端口后向该节点推送配置，响应剥离私钥', async () => {
      prisma.node.findUnique.mockResolvedValue(seededNode);
      prisma.node.update.mockResolvedValue({ ...seededNode, serverPort: 8443 });
      const result = await service.update('n1', { serverHost: '203.0.113.11', serverPort: 8443 });
      expect(prisma.node.update).toHaveBeenCalledWith({
        where: { id: 'n1' },
        data: { serverHost: '203.0.113.11', serverPort: 8443 }
      });
      expect(agentGateway.pushConfig).toHaveBeenCalledWith('n1');
      expect(result.node.config?.privateKey).toBeUndefined();
      expect(result.node.config?.publicKey).toBe('pub');
    });

    it('名称 trim 后为空抛出 BadRequest 且不写库', async () => {
      prisma.node.findUnique.mockResolvedValue(seededNode);
      await expect(service.update('n1', { name: '   ' })).rejects.toThrow(BadRequestException);
      expect(prisma.node.update).not.toHaveBeenCalled();
    });

    it('未提供任何字段抛出 BadRequest', async () => {
      prisma.node.findUnique.mockResolvedValue(seededNode);
      await expect(service.update('n1', {})).rejects.toThrow(BadRequestException);
      expect(prisma.node.update).not.toHaveBeenCalled();
    });

    it('节点不存在抛出 NotFoundException', async () => {
      prisma.node.findUnique.mockResolvedValue(null);
      await expect(service.update('nope', { name: 'x' })).rejects.toThrow(NotFoundException);
      expect(prisma.node.update).not.toHaveBeenCalled();
      expect(agentGateway.pushConfig).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('先断开在线 Agent 再删除节点', async () => {
      prisma.node.findUnique.mockResolvedValue(seededNode);
      prisma.node.delete.mockResolvedValue(seededNode);
      const result = await service.remove('n1');
      expect(result).toEqual({ deleted: true, id: 'n1' });
      expect(agentGateway.disconnectNode).toHaveBeenCalledWith('n1');
      expect(prisma.node.delete).toHaveBeenCalledWith({ where: { id: 'n1' } });
      // 断开连接必须发生在删库之前，避免删除后仍向已删节点写状态
      expect(agentGateway.disconnectNode.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.node.delete.mock.invocationCallOrder[0]
      );
    });

    it('节点不存在抛出 NotFoundException 且不触达网关', async () => {
      prisma.node.findUnique.mockResolvedValue(null);
      await expect(service.remove('nope')).rejects.toThrow(NotFoundException);
      expect(agentGateway.disconnectNode).not.toHaveBeenCalled();
      expect(prisma.node.delete).not.toHaveBeenCalled();
    });
  });
});
