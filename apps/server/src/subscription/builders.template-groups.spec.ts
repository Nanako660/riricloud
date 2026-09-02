import { buildClashYaml, buildSingboxJson, type SubLine, type SubUser } from './builders';
import { parse } from 'yaml';

describe('builders template proxy-groups resolution', () => {
  const user: SubUser = { uuid: 'user-uuid-1', email: 'user@example.com', credential: 'user-pass' };
  const mockNodes: SubLine[] = [
    {
      id: 'line-hk',
      name: '香港直连',
      type: 'DIRECT',
      protocolType: 'VLESS',
      serverHost: 'hk.example.com',
      serverPort: 443,
      params: { flow: '', transport: { type: 'tcp' }, tls: { enabled: false } }
    },
    {
      id: 'line-us',
      name: '美国直连',
      type: 'DIRECT',
      protocolType: 'VLESS',
      serverHost: 'us.example.com',
      serverPort: 443,
      params: { flow: '', transport: { type: 'tcp' }, tls: { enabled: false } }
    }
  ];

  it('Clash 输出中保留 DIRECT/REJECT 与策略组引用，不再被强制抹除为节点列表', () => {
    const template = {
      proxyGroupsJson: JSON.stringify([
        {
          name: '🚀 节点选择',
          type: 'select',
          proxies: ['all', '🔯 故障转移', 'DIRECT']
        },
        {
          name: '🔯 故障转移',
          type: 'fallback',
          url: 'http://www.gstatic.com/generate_204',
          interval: 180,
          proxies: 'all'
        },
        {
          name: '🎯 全球直连',
          type: 'select',
          proxies: ['DIRECT', '🚀 节点选择']
        },
        {
          name: '🛑 广告拦截',
          type: 'select',
          proxies: ['REJECT', 'DIRECT']
        },
        {
          name: 'Google AI',
          type: 'select',
          proxies: ['🚀 节点选择', 'DIRECT', 'all']
        }
      ]),
      ruleSetsJson: '[]',
      dnsConfigJson: '{}'
    };

    const yamlStr = buildClashYaml(user, mockNodes, template);
    const config = parse(yamlStr) as { 'proxy-groups': Array<{ name: string; proxies: string[] }> };
    const groups = new Map(config['proxy-groups'].map((g) => [g.name, g.proxies]));

    // 1. 🚀 节点选择 包含节点 + 故障转移 + DIRECT
    expect(groups.get('🚀 节点选择')).toEqual(['香港直连', '美国直连', '🔯 故障转移', 'DIRECT']);

    // 2. 🔯 故障转移 包含全节点
    expect(groups.get('🔯 故障转移')).toEqual(['香港直连', '美国直连']);

    // 3. 🎯 全球直连 保持纯直连与主策略组，绝不塞入代理节点
    expect(groups.get('🎯 全球直连')).toEqual(['DIRECT', '🚀 节点选择']);

    // 4. 🛑 广告拦截 保持 REJECT 与 DIRECT，绝不塞入代理节点
    expect(groups.get('🛑 广告拦截')).toEqual(['REJECT', 'DIRECT']);

    // 5. Google AI 包含控制项和展开的节点
    expect(groups.get('Google AI')).toEqual(['🚀 节点选择', 'DIRECT', '香港直连', '美国直连']);
  });

  it('Sing-box 输出中将 DIRECT/REJECT 分别转为 direct/block，并正确映射策略组 tag', () => {
    const template = {
      proxyGroupsJson: JSON.stringify([
        {
          name: '🚀 节点选择',
          type: 'select',
          proxies: ['all']
        },
        {
          name: '🎯 全球直连',
          type: 'select',
          proxies: ['DIRECT', '🚀 节点选择']
        },
        {
          name: '🛑 广告拦截',
          type: 'select',
          proxies: ['REJECT', 'DIRECT']
        }
      ]),
      ruleSetsJson: '[]',
      dnsConfigJson: '{}'
    };

    const jsonStr = buildSingboxJson(user, mockNodes, template);
    const config = JSON.parse(jsonStr) as { outbounds: Array<{ tag: string; outbounds?: string[] }> };
    const strategyOutbounds = new Map(
      config.outbounds.filter((o) => Array.isArray(o.outbounds)).map((o) => [o.tag, o.outbounds!])
    );

    expect(strategyOutbounds.get('🚀 节点选择')).toEqual(['香港直连', '美国直连']);
    expect(strategyOutbounds.get('🎯 全球直连')).toEqual(['direct', '🚀 节点选择']);
    expect(strategyOutbounds.get('🛑 广告拦截')).toEqual(['block', 'direct']);
  });
});
