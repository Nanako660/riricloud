import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { parse as parseYaml } from 'yaml';
import { PrismaService } from '../prisma/prisma.service';
import { resolveFormat, SubscriptionService } from './subscription.service';

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  const prisma = {
    user: { findUnique: jest.fn() },
    node: { findMany: jest.fn() }
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        { provide: PrismaService, useValue: prisma }
      ]
    }).compile();
    service = moduleRef.get(SubscriptionService);
  });

  afterEach(() => jest.clearAllMocks());

  const activeUser = {
    id: 'u1',
    subscriptionToken: 'tok-1',
    uuid: '11111111-2222-3333-4444-555555555555',
    isActive: true,
    expireAt: null,
    trafficLimitBytes: BigInt(107374182400),
    trafficUsedBytes: BigInt(0)
  };

  const realityNode = (overrides: Record<string, unknown> = {}) => ({
    id: 'n1',
    name: '东京节点 01',
    serverHost: '203.0.113.10',
    serverPort: 443,
    protocol: 'VLESS_REALITY',
    status: 'ONLINE',
    isPublic: true,
    configPayload: JSON.stringify({
      serverNames: ['www.apple.com'],
      publicKey: 'pbk-test',
      shortIds: ['0123456789abcdef']
    }),
    ...overrides
  });

  describe('默认 Base64 输出', () => {
    it('返回 Base64 编码的 vless URI 列表与流量头', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      prisma.node.findMany.mockResolvedValue([realityNode()]);
      const result = await service.getSubscription('tok-1');
      const decoded = Buffer.from(result.body, 'base64').toString('utf8');
      expect(decoded).toContain(
        `vless://11111111-2222-3333-4444-555555555555@203.0.113.10:443?`
      );
      expect(decoded).toContain('security=reality');
      expect(decoded).toContain('pbk=pbk-test');
      expect(result.contentType).toBe('text/plain; charset=utf-8');
      expect(result.userInfoHeader).toBe(
        'upload=0; download=0; total=107374182400; expire=0'
      );
    });
  });

  describe('Clash Meta YAML 输出', () => {
    it('?type=clash 返回包含 reality 参数与策略组的完整配置', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      prisma.node.findMany.mockResolvedValue([realityNode()]);
      const result = await service.getSubscription('tok-1', { type: 'clash' });
      expect(result.contentType).toBe('text/yaml; charset=utf-8');
      const config = parseYaml(result.body);
      expect(config['mixed-port']).toBe(7890);
      const proxy = config.proxies[0];
      expect(proxy).toMatchObject({
        name: '东京节点 01',
        type: 'vless',
        server: '203.0.113.10',
        port: 443,
        uuid: activeUser.uuid,
        flow: 'xtls-rprx-vision',
        tls: true,
        servername: 'www.apple.com',
        'client-fingerprint': 'chrome'
      });
      expect(proxy['reality-opts']).toEqual({
        'public-key': 'pbk-test',
        'short-id': '0123456789abcdef'
      });
      expect(config['proxy-groups'][0].proxies).toContain('东京节点 01');
      expect(config.rules[0]).toBe('MATCH,节点选择');
    });

    it('重名节点自动追加序号保证 proxy 名唯一', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      prisma.node.findMany.mockResolvedValue([
        realityNode(),
        realityNode({ id: 'n2', name: '东京节点 01' })
      ]);
      const result = await service.getSubscription('tok-1', { type: 'clash' });
      const names = parseYaml(result.body).proxies.map((p: { name: string }) => p.name);
      expect(names).toEqual(['东京节点 01', '东京节点 01 2']);
    });

    it('User-Agent 含 clash/meta/mihomo 时自动切换 YAML', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      prisma.node.findMany.mockResolvedValue([realityNode()]);
      const result = await service.getSubscription('tok-1', {
        userAgent: 'clash.meta/1.19.0'
      });
      expect(result.contentType).toBe('text/yaml; charset=utf-8');
    });
  });

  describe('Sing-box 客户端 JSON 输出', () => {
    it('?type=sing-box 返回 vless 出站（utls + reality）与 direct 兜底', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      prisma.node.findMany.mockResolvedValue([realityNode()]);
      const result = await service.getSubscription('tok-1', { type: 'sing-box' });
      expect(result.contentType).toBe('application/json; charset=utf-8');
      const config = JSON.parse(result.body);
      const [outbound, direct] = config.outbounds;
      expect(outbound).toMatchObject({
        type: 'vless',
        tag: '东京节点 01',
        server: '203.0.113.10',
        server_port: 443,
        uuid: activeUser.uuid,
        flow: 'xtls-rprx-vision'
      });
      expect(outbound.tls.reality).toEqual({
        enabled: true,
        public_key: 'pbk-test',
        short_id: '0123456789abcdef'
      });
      expect(outbound.tls.utls).toEqual({ enabled: true, fingerprint: 'chrome' });
      expect(direct.type).toBe('direct');
    });

    it('User-Agent 含 sing-box 时自动切换 JSON', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      prisma.node.findMany.mockResolvedValue([realityNode()]);
      const result = await service.getSubscription('tok-1', {
        userAgent: 'SFA/1.10.0 (sing-box 1.10.0)'
      });
      expect(result.contentType).toBe('application/json; charset=utf-8');
    });
  });

  it('显式 type 优先于 User-Agent', () => {
    expect(resolveFormat('clash', 'sing-box/1.10')).toBe('clash');
    expect(resolveFormat('sing-box', 'clash.meta/1.19')).toBe('singbox');
  });

  it('非 VLESS_REALITY 协议节点不进入任何格式输出', async () => {
    prisma.user.findUnique.mockResolvedValue(activeUser);
    prisma.node.findMany.mockResolvedValue([
      realityNode({ protocol: 'HYSTERIA2' })
    ]);
    const base64 = await service.getSubscription('tok-1');
    expect(Buffer.from(base64.body, 'base64').toString('utf8')).toBe('');
    const clash = await service.getSubscription('tok-1', { type: 'clash' });
    expect(parseYaml(clash.body).proxies).toEqual([]);
  });

  it('过期用户抛出 ForbiddenException', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...activeUser,
      expireAt: new Date(Date.now() - 86400000)
    });
    await expect(service.getSubscription('tok-1')).rejects.toThrow(ForbiddenException);
  });

  it('超配额用户抛出 ForbiddenException', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...activeUser,
      trafficUsedBytes: BigInt(107374182400)
    });
    await expect(service.getSubscription('tok-1')).rejects.toThrow(ForbiddenException);
  });

  it('无效 token 抛出 NotFoundException', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getSubscription('nope')).rejects.toThrow(NotFoundException);
  });
});
