import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { parse as parseYaml } from 'yaml';
import { PrismaService } from '../prisma/prisma.service';
import { resolveFormat, SubscriptionService } from './subscription.service';

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  const prisma = {
    user: { findUnique: jest.fn() },
    node: { findMany: jest.fn() },
    subscriptionTemplate: { findFirst: jest.fn() }
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

  afterEach(() => jest.resetAllMocks());

  const activeUser = {
    id: 'u1',
    subscriptionToken: 'tok-1',
    uuid: '11111111-2222-3333-4444-555555555555',
    password: 'user-pass',
    isActive: true,
    expireAt: null,
    trafficLimitBytes: BigInt(107374182400),
    trafficUsedBytes: BigInt(0)
  };

  const inbound = (overrides: Record<string, unknown>) => ({
    type: 'VLESS',
    tag: 'in',
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
          privateKey: 'priv',
          publicKey: 'pbk-test',
          shortIds: ['0123456789abcdef']
        }
      }
    }),
    sortOrder: 0,
    isPublic: true,
    ...overrides
  });

  const node = (overrides: Record<string, unknown> = {}) => ({
    id: 'n1',
    name: '东京节点 01',
    serverHost: '203.0.113.10',
    status: 'ONLINE',
    isPublic: true,
    inbounds: [],
    ...overrides
  });

  // 四协议入站各一条（params 为已归一化结构）
  const multiNode = node({
    inbounds: [
      inbound({
        type: 'VLESS',
        tag: 'vless-in',
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
              privateKey: 'priv',
              publicKey: 'pbk-test',
              shortIds: ['0123456789abcdef']
            }
          }
        })
      }),
      inbound({
        type: 'HYSTERIA2',
        tag: 'hy2-in',
        port: 8443,
        paramsJson: JSON.stringify({
          upMbps: 100,
          downMbps: 200,
          tls: {
            enabled: true,
            mode: 'tls',
            serverName: 'hy.example.com',
            certificatePath: '/c',
            keyPath: '/k',
            alpn: ['h3'],
            insecure: false
          }
        })
      }),
      inbound({
        type: 'SHADOWSOCKS',
        tag: 'ss-in',
        port: 8388,
        paramsJson: JSON.stringify({ method: '2022-blake3-aes-128-gcm', password: 'ss-shared' })
      }),
      inbound({
        type: 'TUIC',
        tag: 'tuic-in',
        port: 8443,
        paramsJson: JSON.stringify({
          congestionControl: 'bbr',
          tls: {
            enabled: true,
            mode: 'tls',
            serverName: 'tuic.example.com',
            certificatePath: '/c',
            keyPath: '/k',
            alpn: ['h3'],
            insecure: true
          }
        })
      })
    ]
  });

  describe('默认 Base64 输出', () => {
    it('四协议逐条输出 URI，hy2/tuic 密码取 User.password，ss 取共享密码', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      prisma.node.findMany.mockResolvedValue([multiNode]);
      const result = await service.getSubscription('tok-1');
      const lines = Buffer.from(result.body, 'base64').toString('utf8').split('\n');

      const vless = lines.find((l) => l.startsWith('vless://'));
      expect(vless).toContain(
        `vless://${activeUser.uuid}@203.0.113.10:443?`
      );
      expect(vless).toContain('security=reality');
      expect(vless).toContain('pbk=pbk-test');
      expect(vless).toContain('sid=0123456789abcdef');

      const hy2 = lines.find((l) => l.startsWith('hy2://'));
      expect(hy2).toContain(`hy2://user-pass@203.0.113.10:8443?`);
      expect(hy2).toContain('sni=hy.example.com');
      expect(hy2).toContain('upmbps=100');
      expect(hy2).toContain('downmbps=200');
      expect(hy2).not.toContain('insecure=1');

      const ss = lines.find((l) => l.startsWith('ss://'));
      expect(ss).toContain(`@203.0.113.10:8388`);
      const userinfo = Buffer.from(ss!.split('@')[0].slice(5), 'base64url').toString('utf8');
      expect(userinfo).toBe('2022-blake3-aes-128-gcm:ss-shared');

      const tuic = lines.find((l) => l.startsWith('tuic://'));
      expect(tuic).toContain(`tuic://${activeUser.uuid}:user-pass@203.0.113.10:8443?`);
      expect(tuic).toContain('congestion_control=bbr');
      expect(tuic).toContain('allow_insecure=1');

      expect(result.contentType).toBe('text/plain; charset=utf-8');
      expect(result.userInfoHeader).toBe(
        'upload=0; download=0; total=107374182400; expire=0'
      );
    });

    it('套餐未绑定模板时使用全局默认模板', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      prisma.node.findMany.mockResolvedValue([node({ inbounds: [inbound({})] })]);
      prisma.subscriptionTemplate.findFirst.mockResolvedValue({
        proxyGroupsJson: JSON.stringify([{ name: '默认策略', type: 'select', proxies: 'all' }]),
        ruleSetsJson: '[]',
        dnsConfigJson: '{}'
      });

      const result = await service.getSubscription('tok-1', { type: 'clash' });
      expect(parseYaml(result.body)['proxy-groups']).toEqual([
        { name: '默认策略', type: 'select', proxies: ['东京节点 01'] }
      ]);
    });

    it('用户未设置密码时 hy2 凭证回退 uuid', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...activeUser, password: null });
      prisma.node.findMany.mockResolvedValue([
        node({
          inbounds: [
            inbound({
              type: 'HYSTERIA2',
              paramsJson: JSON.stringify({
                upMbps: 0,
                downMbps: 0,
                tls: {
                  enabled: true,
                  mode: 'tls',
                  serverName: 'hy.example.com',
                  certificatePath: '/c',
                  keyPath: '/k',
                  alpn: ['h3'],
                  insecure: false
                }
              })
            })
          ]
        })
      ]);
      const result = await service.getSubscription('tok-1');
      const decoded = Buffer.from(result.body, 'base64').toString('utf8');
      expect(decoded).toContain(`hy2://${activeUser.uuid}@203.0.113.10:443?`);
    });
  });

  describe('Clash Meta YAML 输出', () => {
    it('?type=clash 返回四协议 proxies 与策略组', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      prisma.node.findMany.mockResolvedValue([multiNode]);
      const result = await service.getSubscription('tok-1', { type: 'clash' });
      expect(result.contentType).toBe('text/yaml; charset=utf-8');
      const config = parseYaml(result.body);
      expect(config['mixed-port']).toBe(7890);
      const proxies = config.proxies;
      expect(proxies).toHaveLength(4);

      const vless = proxies.find((p: { type: string }) => p.type === 'vless');
      expect(vless).toMatchObject({
        name: '东京节点 01·vless-in',
        server: '203.0.113.10',
        port: 443,
        uuid: activeUser.uuid,
        flow: 'xtls-rprx-vision',
        tls: true,
        servername: 'www.apple.com',
        'client-fingerprint': 'chrome'
      });
      expect(vless['reality-opts']).toEqual({
        'public-key': 'pbk-test',
        'short-id': '0123456789abcdef'
      });

      const hy2 = proxies.find((p: { type: string }) => p.type === 'hysteria2');
      expect(hy2).toMatchObject({
        server: '203.0.113.10',
        port: 8443,
        password: 'user-pass',
        sni: 'hy.example.com',
        'skip-cert-verify': false
      });
      expect(hy2.up).toBe('100 Mbps');

      const ss = proxies.find((p: { type: string }) => p.type === 'ss');
      expect(ss).toMatchObject({
        server: '203.0.113.10',
        port: 8388,
        cipher: '2022-blake3-aes-128-gcm',
        password: 'ss-shared'
      });

      const tuic = proxies.find((p: { type: string }) => p.type === 'tuic');
      expect(tuic).toMatchObject({
        server: '203.0.113.10',
        port: 8443,
        uuid: activeUser.uuid,
        password: 'user-pass',
        'skip-cert-verify': true,
        'congestion-controller': 'bbr'
      });

      expect(config['proxy-groups'][0].proxies).toContain('东京节点 01·vless-in');
      expect(config.rules[0]).toBe('MATCH,节点选择');
    });

    it('单入站节点用节点名，多入站节点名追加 tag，重名全局去重', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      prisma.node.findMany.mockResolvedValue([
        node({ id: 'n2', name: '香港节点', inbounds: [inbound({ tag: 'only-in' })] }),
        node({
          id: 'n3',
          name: '香港节点',
          inbounds: [
            inbound({ tag: 'vless-in' }),
            inbound({
              type: 'SHADOWSOCKS',
              tag: 'ss-in',
              paramsJson: JSON.stringify({ method: 'aes-256-gcm', password: 'p' })
            })
          ]
        })
      ]);
      const result = await service.getSubscription('tok-1', { type: 'clash' });
      const names = parseYaml(result.body).proxies.map((p: { name: string }) => p.name);
      expect(names).toEqual(['香港节点', '香港节点·vless-in', '香港节点·ss-in']);
    });

    it('User-Agent 含 clash/meta/mihomo 时自动切换 YAML', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      prisma.node.findMany.mockResolvedValue([multiNode]);
      const result = await service.getSubscription('tok-1', {
        userAgent: 'clash.meta/1.19.0'
      });
      expect(result.contentType).toBe('text/yaml; charset=utf-8');
    });
  });

  describe('Sing-box 客户端 JSON 输出', () => {
    it('?type=sing-box 返回四协议出站与 direct 兜底', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      prisma.node.findMany.mockResolvedValue([multiNode]);
      const result = await service.getSubscription('tok-1', { type: 'sing-box' });
      expect(result.contentType).toBe('application/json; charset=utf-8');
      const config = JSON.parse(result.body);
      const outbounds = config.outbounds;
      expect(outbounds).toHaveLength(5);

      const vless = outbounds.find((o: { type: string }) => o.type === 'vless');
      expect(vless).toMatchObject({
        tag: '东京节点 01·vless-in',
        server: '203.0.113.10',
        server_port: 443,
        uuid: activeUser.uuid,
        flow: 'xtls-rprx-vision'
      });
      expect(vless.tls.reality).toEqual({
        enabled: true,
        public_key: 'pbk-test',
        short_id: '0123456789abcdef'
      });
      expect(vless.tls.utls).toEqual({ enabled: true, fingerprint: 'chrome' });

      const hy2 = outbounds.find((o: { type: string }) => o.type === 'hysteria2');
      expect(hy2).toMatchObject({
        server: '203.0.113.10',
        server_port: 8443,
        password: 'user-pass',
        up_mbps: 100,
        down_mbps: 200
      });
      expect(hy2.tls).toMatchObject({ server_name: 'hy.example.com', insecure: false });

      const ss = outbounds.find((o: { type: string }) => o.type === 'shadowsocks');
      expect(ss).toMatchObject({
        server: '203.0.113.10',
        server_port: 8388,
        method: '2022-blake3-aes-128-gcm',
        password: 'ss-shared'
      });

      const tuic = outbounds.find((o: { type: string }) => o.type === 'tuic');
      expect(tuic).toMatchObject({
        server: '203.0.113.10',
        server_port: 8443,
        uuid: activeUser.uuid,
        password: 'user-pass',
        congestion_control: 'bbr'
      });
      expect(tuic.tls.insecure).toBe(true);

      expect(outbounds[4]).toEqual({ type: 'direct', tag: 'direct' });
    });

    it('User-Agent 含 sing-box 时自动切换 JSON', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      prisma.node.findMany.mockResolvedValue([multiNode]);
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

  it('无入站节点不出现在任何格式输出', async () => {
    prisma.user.findUnique.mockResolvedValue(activeUser);
    prisma.node.findMany.mockResolvedValue([node({ inbounds: [] })]);
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
