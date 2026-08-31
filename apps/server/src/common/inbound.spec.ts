import { BadRequestException } from '@nestjs/common';
import {
  buildClientTls,
  buildClientTransport,
  buildServerInbound,
  generateRealityKeypair,
  normalizeShadowsocksPassword,
  normalizeInboundParams,
  parseDest,
  REALITY_DEFAULTS,
  resolveShadowsocksUserPassword,
  SS_DEFAULT_METHOD
} from './inbound';

const users = [
  { uuid: 'uuid-1', email: 'a@x.com', credential: 'pwd-1' },
  { uuid: 'uuid-2', email: 'b@x.com', credential: 'pwd-2' }
];

describe('generateRealityKeypair', () => {
  it('生成 32 字节裸密钥的 base64url（sing-box 内核可解析，非 PEM）', () => {
    const { privateKey, publicKey } = generateRealityKeypair();
    for (const key of [privateKey, publicKey]) {
      expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(key, 'base64url').length).toBe(32);
    }
  });
});

describe('parseDest', () => {
  it('解析 host:port', () => {
    expect(parseDest('www.apple.com:443')).toEqual({ host: 'www.apple.com', port: 443 });
  });

  it('非法格式抛出 BadRequest', () => {
    for (const bad of ['apple.com', 'host:0', 'host:99999', ':443']) {
      expect(() => parseDest(bad)).toThrow(BadRequestException);
    }
  });
});

describe('normalizeInboundParams', () => {
  it('VLESS 缺省密钥时自动生成 Reality 密钥对并填充默认值', () => {
    const params = normalizeInboundParams('VLESS', {}) as {
      flow: string;
      transport: { type: string };
      tls: {
        mode: string;
        reality: {
          privateKey: string;
          publicKey: string;
          serverNames: string[];
          dest: string;
          shortIds: string[];
        };
      };
    };
    expect(params.tls.mode).toBe('reality');
    expect(params.tls.reality.privateKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(params.tls.reality.publicKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(params.tls.reality.serverNames).toEqual(REALITY_DEFAULTS.serverNames);
    expect(params.tls.reality.dest).toBe(REALITY_DEFAULTS.dest);
    expect(params.tls.reality.shortIds).toEqual(REALITY_DEFAULTS.shortIds);
    expect(params.flow).toBe(REALITY_DEFAULTS.flow);
  });

  it('VLESS Reality 密钥只提供一半时抛出 BadRequest', () => {
    expect(() =>
      normalizeInboundParams('VLESS', {
        tls: { mode: 'reality', reality: { privateKey: 'only-priv' } }
      })
    ).toThrow(BadRequestException);
  });

  it('VLESS 关闭 TLS 时自动移除 Vision flow', () => {
    const params = normalizeInboundParams('VLESS', {
      flow: 'xtls-rprx-vision',
      tls: { enabled: false, mode: 'none' }
    }) as { flow?: string; tls: { enabled: boolean; mode: string } };

    expect(params.flow).toBeUndefined();
    expect(params.tls).toEqual({ enabled: false, mode: 'none' });
  });

  it('VLESS 非法 dest 提前抛出 BadRequest', () => {
    expect(() =>
      normalizeInboundParams('VLESS', {
        tls: { mode: 'reality', reality: { dest: 'no-port' } }
      })
    ).toThrow(BadRequestException);
  });

  it('HYSTERIA2 校验 TLS 必填项并填充默认 alpn', () => {
    const tls = { serverName: 'hy.example.com', certificatePath: '/c.pem', keyPath: '/k.pem' };
    const params = normalizeInboundParams('HYSTERIA2', { upMbps: 100, tls }) as {
      upMbps: number;
      downMbps: number;
      tls: { alpn: string[]; insecure: boolean };
    };
    expect(params.upMbps).toBe(100);
    expect(params.downMbps).toBe(0);
    expect(params.tls.alpn).toEqual(['h3', 'h2', 'http/1.1']);
    expect(params.tls.insecure).toBe(false);
  });

  it('HYSTERIA2 缺少证书路径抛出 BadRequest', () => {
    expect(() =>
      normalizeInboundParams('HYSTERIA2', { tls: { serverName: 'x' } })
    ).toThrow(BadRequestException);
  });

  it('SHADOWSOCKS 缺省密码按方法长度自动生成 base64 密钥', () => {
    const params = normalizeInboundParams('SHADOWSOCKS', {}) as {
      method: string;
      password: string;
      mode: string;
    };
    expect(params.method).toBe(SS_DEFAULT_METHOD);
    expect(Buffer.from(params.password, 'base64').length).toBe(16);
    expect(params.mode).toBe('shared');
  });

  it('SHADOWSOCKS 2022 会把普通密码归一化为固定长度 Base64 密钥', () => {
    const params = normalizeInboundParams('SHADOWSOCKS', {
      method: '2022-blake3-aes-128-gcm',
      password: 'plain-password',
      mode: 'multi-user'
    }) as { password: string; mode: string };

    expect(params.mode).toBe('multi-user');
    expect(Buffer.from(params.password, 'base64').length).toBe(16);
    expect(params.password).not.toBe('plain-password');
  });

  it('TROJAN 协议必须配置 TLS', () => {
    expect(() => normalizeInboundParams('TROJAN', { tls: { enabled: false } })).toThrow(
      BadRequestException
    );
  });

  it('客户端 WebSocket Host 统一映射到 headers.Host', () => {
    expect(buildClientTransport({ type: 'ws', path: '/proxy', host: 'cdn.example.com' })).toEqual({
      type: 'ws',
      path: '/proxy',
      headers: { Host: 'cdn.example.com' }
    });
  });

  it('客户端 Reality TLS 携带公钥、Short ID 与 uTLS', () => {
    expect(buildClientTls({
      enabled: true,
      mode: 'reality',
      serverName: 'www.apple.com',
      reality: {
        dest: 'www.apple.com:443',
        serverNames: ['www.apple.com'],
        privateKey: 'private',
        publicKey: 'public',
        shortIds: ['0123456789abcdef']
      }
    })).toEqual({
      enabled: true,
      server_name: 'www.apple.com',
      utls: { enabled: true, fingerprint: 'chrome' },
      reality: { enabled: true, public_key: 'public', short_id: '0123456789abcdef' }
    });
  });

  it('不支持的协议抛出 BadRequest', () => {
    expect(() => normalizeInboundParams('UNKNOWN_PROTO' as never, {})).toThrow(BadRequestException);
  });
});

describe('sanitizeInboundParams', () => {
  it('脱敏嵌套和旧版扁平 Reality 私钥', async () => {
    const { sanitizeInboundParams } = await import('./inbound');
    const sanitized = sanitizeInboundParams({
      privateKey: 'legacy-private',
      tls: { mode: 'reality', reality: { privateKey: 'nested-private', publicKey: 'public' } }
    });
    expect(sanitized).not.toHaveProperty('privateKey');
    expect((sanitized.tls as { reality: Record<string, unknown> }).reality).not.toHaveProperty('privateKey');
  });
});

describe('buildServerInbound', () => {
  const base = { tag: 'in-1', listen: '::', port: 443 };

  it('VLESS (Reality)：解析 dest 为 handshake，注入 uuid/flow 用户', () => {
    const params = normalizeInboundParams('VLESS', {
      tls: {
        mode: 'reality',
        reality: {
          dest: 'www.apple.com:8443',
          privateKey: 'priv',
          publicKey: 'pub',
          serverNames: ['sni.example.com'],
          shortIds: ['sid-1']
        }
      },
      flow: 'xtls-rprx-vision'
    });
    const inbound = buildServerInbound({ type: 'VLESS', ...base, params, users });
    expect(inbound).toMatchObject({
      type: 'vless',
      tag: 'in-1',
      listen: '::',
      listen_port: 443,
      users: [
        { uuid: 'uuid-1', name: 'a@x.com', flow: 'xtls-rprx-vision' },
        { uuid: 'uuid-2', name: 'b@x.com', flow: 'xtls-rprx-vision' }
      ],
      tls: {
        enabled: true,
        server_name: 'sni.example.com',
        reality: {
          enabled: true,
          handshake: { server: 'www.apple.com', server_port: 8443 },
          private_key: 'priv',
          short_id: ['sid-1']
        }
      }
    });
  });

  it('VLESS (WebSocket + TLS)：注入 transport 与 tls 配置', () => {
    const params = normalizeInboundParams('VLESS', {
      transport: { type: 'ws', path: '/ws-path', host: 'ws.example.com' },
      tls: {
        mode: 'tls',
        serverName: 'ws.example.com',
        certificatePath: '/cert.pem',
        keyPath: '/key.pem'
      }
    });
    const inbound = buildServerInbound({ type: 'VLESS', ...base, params, users });
    expect(inbound).toMatchObject({
      type: 'vless',
      transport: {
        type: 'ws',
        path: '/ws-path',
        headers: { Host: 'ws.example.com' }
      },
      tls: {
        enabled: true,
        server_name: 'ws.example.com',
        certificate_path: '/cert.pem',
        key_path: '/key.pem'
      }
    });
  });

  it('HTTP 传输保留可视化配置的请求头', () => {
    const params = normalizeInboundParams('VLESS', {
      transport: { type: 'http', path: '/proxy', host: 'cdn.example.com', headers: { 'X-Line': 'demo' } },
      tls: { mode: 'none' }
    });
    const inbound = buildServerInbound({ type: 'VLESS', ...base, params, users });
    expect(inbound.transport).toEqual({ type: 'http', host: ['cdn.example.com'], path: '/proxy', headers: { 'X-Line': 'demo' } });
  });

  it('服务端组装会修复已存储的 VLESS 明文 Vision 配置', () => {
    const inbound = buildServerInbound({
      type: 'VLESS',
      ...base,
      params: {
        flow: 'xtls-rprx-vision',
        transport: { type: 'tcp' },
        tls: { enabled: false, mode: 'none' }
      },
      users
    });

    expect(inbound).not.toHaveProperty('tls');
    expect(inbound.users).toEqual([
      { uuid: 'uuid-1', name: 'a@x.com' },
      { uuid: 'uuid-2', name: 'b@x.com' }
    ]);
  });

  it('VMESS (gRPC)：注入 transport 与 alterId', () => {
    const params = normalizeInboundParams('VMESS', {
      alterId: 0,
      transport: { type: 'grpc', serviceName: 'my-grpc' }
    });
    const inbound = buildServerInbound({ type: 'VMESS', ...base, params, users });
    expect(inbound).toMatchObject({
      type: 'vmess',
      transport: { type: 'grpc', service_name: 'my-grpc' },
      users: [
        { uuid: 'uuid-1', name: 'a@x.com', alterId: 0 },
        { uuid: 'uuid-2', name: 'b@x.com', alterId: 0 }
      ]
    });
  });

  it('TROJAN：注入 password 用户凭证', () => {
    const params = normalizeInboundParams('TROJAN', {
      tls: {
        mode: 'tls',
        serverName: 'tr.example.com',
        certificatePath: '/cert.pem',
        keyPath: '/key.pem'
      }
    });
    const inbound = buildServerInbound({ type: 'TROJAN', ...base, params, users });
    expect(inbound).toMatchObject({
      type: 'trojan',
      users: [
        { password: 'pwd-1', name: 'a@x.com' },
        { password: 'pwd-2', name: 'b@x.com' }
      ]
    });
  });

  it('HYSTERIA2：证书路径与限速注入，用户密码取 credential', () => {
    const params = normalizeInboundParams('HYSTERIA2', {
      upMbps: 100,
      downMbps: 200,
      tls: { serverName: 'hy.example.com', certificatePath: '/c.pem', keyPath: '/k.pem' }
    });
    const inbound = buildServerInbound({ type: 'HYSTERIA2', ...base, params, users });
    expect(inbound).toMatchObject({
      type: 'hysteria2',
      up_mbps: 100,
      down_mbps: 200,
      users: [
        { name: 'a@x.com', password: 'pwd-1' },
        { name: 'b@x.com', password: 'pwd-2' }
      ],
      tls: { certificate_path: '/c.pem', key_path: '/k.pem' }
    });
  });

  it('TUIC：用户注入 uuid + credential，拥塞控制透传', () => {
    const params = normalizeInboundParams('TUIC', {
      congestionControl: 'cubic',
      tls: { serverName: 'tuic.example.com', certificatePath: '/c.pem', keyPath: '/k.pem' }
    });
    const inbound = buildServerInbound({ type: 'TUIC', ...base, params, users });
    expect(inbound).toMatchObject({
      type: 'tuic',
      congestion_control: 'cubic',
      users: [
        { uuid: 'uuid-1', name: 'a@x.com', password: 'pwd-1' },
        { uuid: 'uuid-2', name: 'b@x.com', password: 'pwd-2' }
      ]
    });
  });

  it('SHADOWSOCKS：共享密码模式不注入用户列表', () => {
    const params = normalizeInboundParams('SHADOWSOCKS', {
      method: 'aes-256-gcm',
      password: 'shared'
    });
    const inbound = buildServerInbound({ type: 'SHADOWSOCKS', ...base, params, users });
    expect(inbound).toMatchObject({ type: 'shadowsocks', method: 'aes-256-gcm', password: 'shared' });
    expect((inbound as Record<string, unknown>).users).toBeUndefined();
  });

  it('SHADOWTLS v3：解析 dest、version 并使用 users', () => {
    const params = normalizeInboundParams('SHADOWTLS', {
      version: 3,
      handshakeDest: 'gateway.icloud.com:443',
      password: 'st-password'
    });
    const inbound = buildServerInbound({ type: 'SHADOWTLS', ...base, params, users });
    expect(inbound).toMatchObject({
      type: 'shadowtls',
      version: 3,
      users: [
        { name: 'a@x.com', password: 'pwd-1' },
        { name: 'b@x.com', password: 'pwd-2' }
      ],
      handshake: { server: 'gateway.icloud.com', server_port: 443 },
    });
  });

  it('SHADOWSOCKS 2022 多用户为每个用户生成合法独立密钥', () => {
    const params = normalizeInboundParams('SHADOWSOCKS', {
      method: '2022-blake3-aes-128-gcm',
      password: 'server-password',
      mode: 'multi-user'
    });
    const inbound = buildServerInbound({ type: 'SHADOWSOCKS', ...base, params, users });
    const userEntries = inbound.users as Array<{ name: string; password: string }>;

    expect(userEntries).toEqual([
      { name: 'a@x.com', password: resolveShadowsocksUserPassword('2022-blake3-aes-128-gcm', 'pwd-1', 'uuid-1') },
      { name: 'b@x.com', password: resolveShadowsocksUserPassword('2022-blake3-aes-128-gcm', 'pwd-2', 'uuid-2') }
    ]);
    expect(Buffer.from((inbound.password as string), 'base64').length).toBe(16);
    expect(inbound.password).toBe(normalizeShadowsocksPassword('2022-blake3-aes-128-gcm', 'server-password'));
  });
});
