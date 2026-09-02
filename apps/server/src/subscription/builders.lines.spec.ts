import { buildClashYaml, buildSingboxJson, buildUriList, entryLabels, type SubLine, type SubUser } from './builders';
import { parse } from 'yaml';

describe('subscription builders with lines', () => {
  const user: SubUser = { uuid: 'user-uuid', email: 'user@example.com', credential: 'user-password' };
  const line: SubLine = {
    id: 'line-1',
    name: '香港中继',
    type: 'RELAY',
    relayMode: 'BLIND_FORWARD',
    endpointOverrideEnabled: true,
    serverHost: 'relay.example.com',
    serverPort: 8443,
    serverName: 'www.apple.com',
    host: 'cdn.example.com',
    trafficRate: 1.5,
    tags: ['hk', 'relay'],
    level: 2,
    targetInbound: {
      type: 'VLESS',
      tag: 'vless-in',
      port: 443,
      params: {
        flow: 'xtls-rprx-vision',
        transport: { type: 'ws', path: '/proxy', host: 'origin.example.com' },
        tls: { enabled: true, mode: 'tls', serverName: 'origin.example.com', alpn: ['http/1.1'], insecure: false }
      }
    }
  };

  it('线路名称包含倍率且连接覆盖参数进入 Clash 输出', () => {
    expect(entryLabels([line])).toEqual(['香港中继 [1.5x]']);
    const config = parse(buildClashYaml(user, [line])) as { proxies: Array<Record<string, unknown>> };
    expect(config.proxies[0]).toMatchObject({
      name: '香港中继 [1.5x]',
      server: 'relay.example.com',
      port: 8443,
      servername: 'www.apple.com',
      alpn: ['http/1.1'],
      'ws-opts': { path: '/proxy', headers: { Host: 'cdn.example.com' } }
    });
  });

  it('线路覆盖参数进入 Sing-box 与 Base64 URI 输出', () => {
    const config = JSON.parse(buildSingboxJson(user, [line])) as { outbounds: Array<Record<string, unknown>> };
    expect(config.outbounds[0]).toMatchObject({
      tag: '香港中继 [1.5x]',
      server: 'relay.example.com',
      server_port: 8443,
      tls: { server_name: 'www.apple.com', alpn: ['http/1.1'] },
      transport: { type: 'ws', path: '/proxy', headers: { Host: 'cdn.example.com' } }
    });
    const [uri] = buildUriList(user, [line]);
    expect(uri).toContain('vless://user-uuid@relay.example.com:8443');
    expect(uri).toContain('sni=www.apple.com');
    expect(uri).toContain('host=cdn.example.com');
  });

  it('关闭线路覆盖时回退到目标入站的 SNI 与 Host', () => {
    const disabledLine = {
      ...line,
      endpointOverrideEnabled: false,
      serverName: 'stale.example.com',
      host: 'stale-cdn.example.com'
    };
    const config = parse(buildClashYaml(user, [disabledLine])) as { proxies: Array<Record<string, unknown>> };

    expect(config.proxies[0]).toMatchObject({
      servername: 'origin.example.com',
      'ws-opts': { headers: { Host: 'origin.example.com' } }
    });
  });

  it('Sing-box 默认策略组与 DIRECT/REJECT 路由目标均有对应出站', () => {
    const config = JSON.parse(buildSingboxJson(user, [line], {
      proxyGroupsJson: JSON.stringify([{ name: '代理组', type: 'select' }]),
      ruleSetsJson: JSON.stringify([
        { type: 'match', target: 'DIRECT' },
        { type: 'domain-suffix', rules: ['example.com'], target: 'REJECT' }
      ])
    })) as { outbounds: Array<Record<string, unknown>>; route: { rules: Array<Record<string, unknown>> } };

    expect(config.outbounds).toEqual(expect.arrayContaining([
      { type: 'direct', tag: 'direct' },
      { type: 'block', tag: 'block' },
      { type: 'selector', tag: '代理组', outbounds: ['香港中继 [1.5x]'] }
    ]));
    expect(config.route.rules).toEqual([
      { action: 'route', outbound: 'direct' },
      { domain_suffix: ['example.com'], outbound: 'block' }
    ]);
  });

  it('ShadowTLS 输出为 SS2022 + ShadowTLS v3 组合线路', () => {
    const shadowtlsLine: SubLine = {
      ...line,
      name: 'ShadowTLS v3',
      targetInbound: {
        type: 'SHADOWTLS',
        tag: 'shadowtls-in',
        port: 443,
        params: {
          version: 3,
          handshakeDest: 'www.apple.com:443',
          strictMode: true,
          inner: {
            type: 'SHADOWSOCKS',
            method: '2022-blake3-aes-128-gcm',
            password: 'inner-password'
          }
        }
      }
    };
    const clash = parse(buildClashYaml(user, [shadowtlsLine])) as { proxies: Array<Record<string, unknown>> };
    expect(clash.proxies[0]).toMatchObject({
      name: 'ShadowTLS v3 [1.5x]',
      type: 'ss',
      cipher: '2022-blake3-aes-128-gcm',
      plugin: 'shadow-tls',
      'client-fingerprint': 'chrome',
      'plugin-opts': { host: 'www.apple.com', password: user.credential, version: 3 }
    });

    const singbox = JSON.parse(buildSingboxJson(user, [shadowtlsLine])) as {
      outbounds: Array<Record<string, unknown>>;
    };
    expect(singbox.outbounds).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'shadowsocks', tag: 'ShadowTLS v3 [1.5x]', detour: 'ShadowTLS v3 [1.5x] · ShadowTLS' }),
      expect.objectContaining({ type: 'shadowtls', tag: 'ShadowTLS v3 [1.5x] · ShadowTLS', version: 3, password: user.credential })
    ]));
    const selector = singbox.outbounds.find((outbound) => outbound.type === 'selector') as { outbounds: string[] };
    expect(selector.outbounds).toEqual(['ShadowTLS v3 [1.5x]']);

    const [uri] = buildUriList(user, [shadowtlsLine]);
    expect(uri).toContain('ss://');
    expect(uri).toContain('plugin=shadow-tls%3Bhost%3Dwww.apple.com');
  });
});
