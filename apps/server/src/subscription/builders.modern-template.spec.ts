import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'yaml';
import { buildClashYaml, buildSingboxJson, type SubLine, type SubUser } from './builders';

describe('builders with modernized 08_full_template_payload.json', () => {
  const user: SubUser = { uuid: 'user-uuid-1', email: 'user@example.com', credential: 'user-pass' };
  const mockNodes: SubLine[] = [
    {
      id: 'line-hk',
      name: '香港直连 01',
      type: 'DIRECT',
      protocolType: 'VLESS',
      serverHost: 'hk.example.com',
      serverPort: 443,
      params: { flow: '', transport: { type: 'tcp' }, tls: { enabled: false } }
    },
    {
      id: 'line-jp',
      name: '日本优选 01',
      type: 'DIRECT',
      protocolType: 'HYSTERIA2',
      serverHost: 'jp.example.com',
      serverPort: 443,
      params: { upMbps: 100, downMbps: 200 }
    },
    {
      id: 'line-us',
      name: '美国节点 01',
      type: 'DIRECT',
      protocolType: 'VLESS',
      serverHost: 'us.example.com',
      serverPort: 443,
      params: { flow: '', transport: { type: 'tcp' }, tls: { enabled: false } }
    }
  ];

  const payloadPath = resolve(__dirname, '../../../../artifacts/extracted_template/08_full_template_payload.json');
  const rawPayload = JSON.parse(readFileSync(payloadPath, 'utf-8')) as {
    proxyGroups: unknown[];
    ruleSets: unknown[];
    dnsConfig: Record<string, unknown>;
    customInjectYaml?: string;
    customInjectJson?: string;
  };

  const templateConfig = {
    proxyGroupsJson: JSON.stringify(rawPayload.proxyGroups),
    ruleSetsJson: JSON.stringify(rawPayload.ruleSets),
    dnsConfigJson: JSON.stringify(rawPayload.dnsConfig),
    customInjectYaml: rawPayload.customInjectYaml,
    customInjectJson: rawPayload.customInjectJson
  };

  it('成功构建 Clash 配置，具备全部 18 个策略组、远端规则集及 Fake-IP DNS', () => {
    const yamlStr = buildClashYaml(user, mockNodes, templateConfig);
    expect(yamlStr).toBeTruthy();

    const config = parse(yamlStr) as {
      'mixed-port': number;
      'allow-lan': boolean;
      mode: string;
      dns: {
        enable: boolean;
        'enhanced-mode': string;
        nameserver: string[];
      };
      'proxy-groups': Array<{ name: string; type: string; proxies: string[] }>;
      'rule-providers': Record<string, { type: string; url: string; behavior: string }>;
      rules: string[];
    };

    // 1. 基础与注入参数
    expect(config['mixed-port']).toBe(7890);
    expect(config['allow-lan']).toBe(true);
    expect(config.mode).toBe('rule');

    // 2. DNS 配置
    expect(config.dns.enable).toBe(true);
    expect(config.dns['enhanced-mode']).toBe('fake-ip');

    // 3. 策略组覆盖 (18 个业务策略组)
    const groupNames = config['proxy-groups'].map((g) => g.name);
    expect(groupNames).toEqual(expect.arrayContaining([
      '🔰 节点选择',
      '🔯 自动优选',
      '🤖 ChatGPT',
      '🧠 Google AI',
      '🎬 YouTube',
      '🍎 Apple',
      '🎮 Steam',
      '📲 Telegram',
      '☁️ CloudFlare',
      '📺 哔哩哔哩',
      '🎵 网易云音乐',
      'Ⓜ️ 微软云盘',
      '💚 Nvidia',
      '🐱 GitHub',
      '🎨 Pixiv',
      '🎯 全球直连',
      '🛑 广告拦截',
      '🐟 漏网之鱼'
    ]));

    // 4. 远程规则提供者校验
    const providers = config['rule-providers'];
    expect(Object.keys(providers)).toEqual(expect.arrayContaining([
      'advertising',
      'chatgpt',
      'google-ai',
      'youtube',
      'telegram',
      'apple',
      'steam',
      'cloudflare',
      'bilibili',
      'neteasemusic',
      'onedrive',
      'nvidia',
      'github',
      'pixiv',
      'chinamax'
    ]));

    // 5. 规则序列正确包含 RULE-SET、GEOIP、MATCH 且无出站名字污染
    expect(config.rules).toEqual(expect.arrayContaining([
      'RULE-SET,chatgpt,🤖 ChatGPT',
      'RULE-SET,google-ai,🧠 Google AI',
      'RULE-SET,youtube,🎬 YouTube',
      'RULE-SET,steam,🎮 Steam',
      'GEOIP,CN,🎯 全球直连,no-resolve',
      'MATCH,🐟 漏网之鱼'
    ]));

    // 确认绝无残存的 ",no-resolve" 污染进入策略名
    for (const rule of config.rules) {
      const parts = rule.split(',');
      if (parts[0] === 'RULE-SET') {
        expect(parts[2]).not.toContain(',no-resolve');
      }
    }
  });

  it('成功构建 Sing-box 配置，生成合规的 route.rule_set, route.rules 与 inbounds', () => {
    const jsonStr = buildSingboxJson(user, mockNodes, templateConfig);
    expect(jsonStr).toBeTruthy();

    const config = JSON.parse(jsonStr) as {
      inbounds: Array<{ type: string; listen_port: number }>;
      outbounds: Array<{ tag: string; type: string }>;
      dns: {
        servers: Array<{ tag: string; address: string }>;
        fakeip?: { enabled: boolean };
      };
      route: {
        rule_set: Array<{ tag: string; type: string; format: string; url: string }>;
        rules: Array<Record<string, unknown>>;
      };
      experimental?: {
        clash_api?: { external_controller: string };
      };
    };

    // 1. 注入入站与控制器
    expect(config.inbounds).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'mixed', listen_port: 7890 })
    ]));
    expect(config.experimental?.clash_api?.external_controller).toBe('127.0.0.1:9090');

    // 2. DNS
    expect(config.dns.servers).toEqual(expect.arrayContaining([
      expect.objectContaining({ tag: 'dns_direct' }),
      expect.objectContaining({ tag: 'dns_proxy' }),
      expect.objectContaining({ tag: 'dns_fakeip', address: 'fakeip' })
    ]));
    expect(config.dns.fakeip?.enabled).toBe(true);

    // 3. 策略组标签与核心出站
    const outboundTags = config.outbounds.map((o) => o.tag);
    expect(outboundTags).toEqual(expect.arrayContaining([
      'direct',
      'block',
      '🔰 节点选择',
      '🔯 自动优选',
      '🤖 ChatGPT',
      '🧠 Google AI',
      '🎬 YouTube',
      '🍎 Apple',
      '🎮 Steam',
      '📲 Telegram',
      '🎯 全球直连',
      '🛑 广告拦截',
      '🐟 漏网之鱼'
    ]));

    // 4. Sing-box remote rule_set 列表
    expect(config.route.rule_set).toEqual(expect.arrayContaining([
      expect.objectContaining({ tag: 'advertising', format: 'binary' }),
      expect.objectContaining({ tag: 'chatgpt', format: 'binary' }),
      expect.objectContaining({ tag: 'google-ai', format: 'binary' }),
      expect.objectContaining({ tag: 'youtube', format: 'binary' }),
      expect.objectContaining({ tag: 'steam', format: 'binary' }),
      expect.objectContaining({ tag: 'chinamax', format: 'binary' })
    ]));

    // 5. 路由匹配规则正确映射 outbound
    expect(config.route.rules).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule_set: ['chatgpt'], outbound: '🤖 ChatGPT' }),
      expect.objectContaining({ rule_set: ['google-ai'], outbound: '🧠 Google AI' }),
      expect.objectContaining({ rule_set: ['youtube'], outbound: '🎬 YouTube' }),
      expect.objectContaining({ rule_set: ['steam'], outbound: '🎮 Steam' }),
      expect.objectContaining({ geoip: ['cn'], outbound: '🎯 全球直连' }),
      expect.objectContaining({ action: 'route', outbound: '🐟 漏网之鱼' })
    ]));
  });
});
