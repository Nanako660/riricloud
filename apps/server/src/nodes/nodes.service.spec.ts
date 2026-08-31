import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AgentGatewayService } from '../agent-gateway/agent-gateway.service';
import { PrismaService } from '../prisma/prisma.service';
import { NodesService } from './nodes.service';

describe('NodesService', () => {
  let service: NodesService;
  const prisma = {
    node: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    nodeInbound: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    line: { findFirst: jest.fn() }
  };  const agentGateway = { pushConfig: jest.fn(), disconnectNode: jest.fn() };

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
    agentToken: 'tok',
    status: 'ONLINE',
    configOverride: null,
    isLocal: false,
    isPublic: true,
    inbounds: []
  };

  const realityInbound = {
    id: 'in-1',
    nodeId: 'n1',
    type: 'VLESS',
    tag: 'vless-in',
    listen: '::',
    port: 443,
    paramsJson: JSON.stringify({
      flow: 'xtls-rprx-vision',
      transport: { type: 'tcp' },
      tls: {
        enabled: true,
        mode: 'reality',
        serverName: 'www.apple.com',
        reality: {
          dest: 'www.apple.com:443',
          serverNames: ['www.apple.com'],
          privateKey: 'priv-secret',
          publicKey: 'pub',
          shortIds: ['0123456789abcdef']
        }
      }
    }),
    sortOrder: 0,
    isPublic: true
  };

  describe('create', () => {
    it('只创建基础信息并返回安装指引（入站单独管理）', async () => {
      prisma.node.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...seededNode, id: 'n9', ...data, inbounds: [] })
      );
      const result = await service.create({ serverHost: '203.0.113.10' }, 'admin-1');
      expect(prisma.node.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.not.objectContaining({ serverPort: expect.anything() }) })
      );
      expect(result.node.inbounds).toEqual([]);
      expect(result.agentToken).toMatch(/^[0-9a-f]{64}$/);
      expect(result.installCommand).toContain('install.sh');
    });
  });

  describe('update', () => {
    it('更新地址后推送配置，合法 configOverride 落库', async () => {
      prisma.node.findUnique.mockResolvedValue(seededNode);
      prisma.node.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...seededNode, ...data, inbounds: [] })
      );
      const result = await service.update('n1', {
        serverHost: '203.0.113.11',
        configOverride: '{"log":{"level":"debug"}}'
      });
      expect(prisma.node.update).toHaveBeenCalledWith({
        where: { id: 'n1' },
        data: { serverHost: '203.0.113.11', configOverride: '{"log":{"level":"debug"}}' },
        include: expect.anything()
      });
      expect(agentGateway.pushConfig).toHaveBeenCalledWith('n1');
      expect(result.node.configOverride).toBe('{"log":{"level":"debug"}}');
    });

    it('configOverride 传 null 清除覆盖', async () => {
      prisma.node.findUnique.mockResolvedValue({ ...seededNode, configOverride: '{}' });
      prisma.node.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...seededNode, ...data, inbounds: [] })
      );
      await service.update('n1', { configOverride: null });
      expect(prisma.node.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ configOverride: null }) })
      );
    });

    it('configOverride 非法 JSON 抛出 BadRequest 且不写库', async () => {
      prisma.node.findUnique.mockResolvedValue(seededNode);
      await expect(service.update('n1', { configOverride: '{oops' })).rejects.toThrow(BadRequestException);
      expect(prisma.node.update).not.toHaveBeenCalled();
    });

    it('名称 trim 后为空抛出 BadRequest 且不写库', async () => {
      prisma.node.findUnique.mockResolvedValue(seededNode);
      await expect(service.update('n1', { name: '   ' })).rejects.toThrow(BadRequestException);
      expect(prisma.node.update).not.toHaveBeenCalled();
    });

    it('未提供任何字段抛出 BadRequest', async () => {
      prisma.node.findUnique.mockResolvedValue(seededNode);
      await expect(service.update('n1', {})).rejects.toThrow(BadRequestException);
    });

    it('节点不存在抛出 NotFoundException', async () => {
      prisma.node.findUnique.mockResolvedValue(null);
      await expect(service.update('nope', { name: 'x' })).rejects.toThrow(NotFoundException);
      expect(agentGateway.pushConfig).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('主控本机节点不可删除', async () => {
      prisma.node.findUnique.mockResolvedValue({ ...seededNode, isLocal: true });

      await expect(service.remove('n1')).rejects.toThrow(ConflictException);
      expect(agentGateway.disconnectNode).not.toHaveBeenCalled();
      expect(prisma.node.delete).not.toHaveBeenCalled();
    });

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

  describe('createInbound', () => {
    it('缺省端口时生成五位随机端口并默认监听 IPv4 通配地址', async () => {
      prisma.node.findUnique.mockResolvedValue({ ...seededNode, inbounds: [] });
      prisma.nodeInbound.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'in-random', ...data })
      );

      await service.createInbound('n1', { type: 'VLESS' });

      const created = prisma.nodeInbound.create.mock.calls[0][0].data;
      expect(created.listen).toBe('0.0.0.0');
      expect(created.port).toEqual(expect.any(Number));
      expect(created.port).toBeGreaterThanOrEqual(20000);
      expect(created.port).toBeLessThanOrEqual(29999);
    });

    it('缺省 tag 按协议前缀生成，响应剥离私钥并推送配置', async () => {
      prisma.node.findUnique.mockResolvedValue({ ...seededNode, inbounds: [] });
      prisma.nodeInbound.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'in-9', ...data })
      );
      const result = await service.createInbound('n1', {
        type: 'VLESS',
        port: 8443,
        params: { tls: { mode: 'reality', reality: { privateKey: 'priv-1', publicKey: 'pub-1' } } }
      });
      const created = prisma.nodeInbound.create.mock.calls[0][0].data;
      expect(created.tag).toBe('vless-in');
      expect(JSON.parse(created.paramsJson).tls.reality.privateKey).toBe('priv-1');
      const params = (result.inbound as { params: Record<string, unknown> }).params as {
        tls?: { reality?: { privateKey?: string; publicKey?: string } };
      };
      expect(params.tls?.reality?.privateKey).toBeUndefined();
      expect(params.tls?.reality?.publicKey).toBe('pub-1');
      expect(agentGateway.pushConfig).toHaveBeenCalledWith('n1');
    });

    it('缺省 tag 冲突时自动追加序号', async () => {
      prisma.node.findUnique.mockResolvedValue({
        ...seededNode,
        inbounds: [{ tag: 'vless-in' }, { tag: 'vless-in-2' }]
      });
      prisma.nodeInbound.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'in-9', ...data })
      );
      await service.createInbound('n1', { type: 'VLESS', port: 9000 });
      expect(prisma.nodeInbound.create.mock.calls[0][0].data.tag).toBe('vless-in-3');
    });

    it('显式 tag 冲突抛出 ConflictException', async () => {
      prisma.node.findUnique.mockResolvedValue({ ...seededNode, inbounds: [{ tag: 'vless-in' }] });
      await expect(
        service.createInbound('n1', { type: 'VLESS', port: 9000, tag: 'vless-in' })
      ).rejects.toThrow(ConflictException);
      expect(prisma.nodeInbound.create).not.toHaveBeenCalled();
    });

    it('同传输层端口冲突抛出 ConflictException', async () => {
      prisma.node.findUnique.mockResolvedValue({ ...seededNode, inbounds: [realityInbound] });
      await expect(
        service.createInbound('n1', { type: 'VLESS', port: 443 })
      ).rejects.toThrow(ConflictException);
    });

    it('UDP 协议可与占用同端口的 TCP 入站共存', async () => {
      prisma.node.findUnique.mockResolvedValue({ ...seededNode, inbounds: [realityInbound] });
      prisma.nodeInbound.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'in-8', ...data })
      );
      await expect(
        service.createInbound('n1', {
          type: 'HYSTERIA2',
          port: 443,
          params: { tls: { serverName: 'x', certificatePath: '/c', keyPath: '/k' } }
        })
      ).resolves.toBeDefined();
    });

    it('两个 UDP 协议同端口仍冲突', async () => {
      prisma.node.findUnique.mockResolvedValue({
        ...seededNode,
        inbounds: [{ ...realityInbound, type: 'TUIC' }]
      });
      await expect(
        service.createInbound('n1', {
          type: 'HYSTERIA2',
          port: 443,
          params: { tls: { serverName: 'x', certificatePath: '/c', keyPath: '/k' } }
        })
      ).rejects.toThrow(ConflictException);
    });

    it('节点不存在抛出 NotFoundException', async () => {
      prisma.node.findUnique.mockResolvedValue(null);
      await expect(
        service.createInbound('nope', { type: 'VLESS', port: 443 })
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateInbound', () => {
    it('params 浅合并保留未提供的私钥并重新归一化', async () => {
      prisma.nodeInbound.findFirst.mockResolvedValue(realityInbound);
      prisma.nodeInbound.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...realityInbound, ...data })
      );
      const result = await service.updateInbound('n1', 'in-1', {
        params: { tls: { mode: 'reality', reality: { dest: 'www.microsoft.com:443' } } }
      });
      const updated = JSON.parse(prisma.nodeInbound.update.mock.calls[0][0].data.paramsJson);
      expect(updated.tls.reality.privateKey).toBe('priv-secret'); // 脱敏响应不含私钥，合并不得丢失
      expect(updated.tls.reality.dest).toBe('www.microsoft.com:443');
      const params = (result.inbound as { params: Record<string, unknown> }).params as {
        tls?: { reality?: { privateKey?: string } };
      };
      expect(params.tls?.reality?.privateKey).toBeUndefined();
      expect(agentGateway.pushConfig).toHaveBeenCalledWith('n1');
    });

    it('修改端口与同传输层入站冲突抛出 ConflictException', async () => {
      prisma.nodeInbound.findFirst.mockResolvedValue(realityInbound);
      prisma.nodeInbound.findMany.mockResolvedValue([{ ...realityInbound, id: 'in-2', port: 8443, tag: 'vless-in-2' }]);
      await expect(
        service.updateInbound('n1', 'in-1', { port: 8443 })
      ).rejects.toThrow(ConflictException);
      expect(prisma.nodeInbound.update).not.toHaveBeenCalled();
    });

    it('tag 改为其他入站已占用值抛出 ConflictException', async () => {
      prisma.nodeInbound.findFirst.mockResolvedValueOnce(realityInbound); // 入站查询
      prisma.nodeInbound.findFirst.mockResolvedValueOnce({ id: 'in-2', tag: 'vless-in-2' }); // tag 冲突查询
      await expect(
        service.updateInbound('n1', 'in-1', { tag: 'vless-in-2' })
      ).rejects.toThrow(ConflictException);
    });

    it('未提供任何字段抛出 BadRequest', async () => {
      prisma.nodeInbound.findFirst.mockResolvedValue(realityInbound);
      await expect(service.updateInbound('n1', 'in-1', {})).rejects.toThrow(BadRequestException);
    });

    it('入站不存在或不属于该节点抛出 NotFoundException', async () => {
      prisma.nodeInbound.findFirst.mockResolvedValue(null);
      await expect(service.updateInbound('n1', 'nope', { port: 9000 })).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('removeInbound', () => {
    it('删除入站并推送配置', async () => {
      prisma.nodeInbound.findFirst.mockResolvedValue(realityInbound);
      prisma.nodeInbound.delete.mockResolvedValue(realityInbound);
      const result = await service.removeInbound('n1', 'in-1');
      expect(result).toEqual({ deleted: true, id: 'in-1' });
      expect(prisma.nodeInbound.delete).toHaveBeenCalledWith({ where: { id: 'in-1' } });
      expect(agentGateway.pushConfig).toHaveBeenCalledWith('n1');
    });

    it('入站不存在抛出 NotFoundException', async () => {
      prisma.nodeInbound.findFirst.mockResolvedValue(null);
      await expect(service.removeInbound('n1', 'nope')).rejects.toThrow(NotFoundException);
    });
  });

  it('realityKeypair 返回 32 字节裸密钥 base64url（不落库）', () => {
    const { privateKey, publicKey } = service.realityKeypair();
    expect(privateKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(publicKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
