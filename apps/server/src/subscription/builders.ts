import { stringify } from 'yaml';

// Reality 客户端参数须与节点 configPayload 一致（当前为演示默认值）
const REALITY_CLIENT_DEFAULTS = {
  sni: 'www.apple.com',
  fp: 'chrome'
};

const VLESS_FLOW = 'xtls-rprx-vision';

// 订阅输出涉及的节点字段（协议字段为 VLESS_REALITY 专用，见 docs/DATA_MODELS.md §Node）
export interface SubNode {
  name: string;
  serverHost: string;
  serverPort: number;
  protocol: string;
  configPayload: string | null;
}

interface RealityClientConfig {
  sni: string;
  fp: string;
  publicKey: string;
  shortId: string;
}

// 解析节点 Reality 握手参数；缺失键回退演示默认值（与 vless URI 行为一致）
function parseReality(node: SubNode): RealityClientConfig {
  const config = node.configPayload
    ? (JSON.parse(node.configPayload) as {
        publicKey?: string;
        serverNames?: string[];
        shortIds?: string[];
      })
    : {};
  return {
    sni: config.serverNames?.[0] ?? REALITY_CLIENT_DEFAULTS.sni,
    fp: REALITY_CLIENT_DEFAULTS.fp,
    publicKey: config.publicKey ?? '',
    shortId: config.shortIds?.[0] ?? ''
  };
}

// vless://<uuid>@<host>:<port>?encryption=none&flow=xtls-rprx-vision&security=reality&sni=..&fp=chrome&pbk=..&sid=..&type=tcp#<name>
export function buildVlessUri(userUuid: string, node: SubNode): string {
  const r = parseReality(node);
  const params = new URLSearchParams({
    encryption: 'none',
    flow: VLESS_FLOW,
    security: 'reality',
    sni: r.sni,
    fp: r.fp,
    pbk: r.publicKey,
    sid: r.shortId,
    type: 'tcp'
  });
  return `vless://${userUuid}@${node.serverHost}:${node.serverPort}?${params.toString()}#${encodeURIComponent(node.name)}`;
}

// Clash 要求 proxy 名唯一，重名节点自动追加序号
export function dedupeNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name} ${count + 1}`;
  });
}

// Clash Meta 客户端配置：完整最小可用（基础设置 + proxies + 策略组 + 兜底规则）
export function buildClashYaml(userUuid: string, nodes: SubNode[]): string {
  const names = dedupeNames(nodes.map((n) => n.name));
  const proxies = nodes.map((node, i) => {
    const r = parseReality(node);
    return {
      name: names[i],
      type: 'vless',
      server: node.serverHost,
      port: node.serverPort,
      uuid: userUuid,
      flow: VLESS_FLOW,
      network: 'tcp',
      udp: true,
      tls: true,
      servername: r.sni,
      'client-fingerprint': r.fp,
      'reality-opts': { 'public-key': r.publicKey, 'short-id': r.shortId }
    };
  });
  const group = '节点选择';
  const config = {
    'mixed-port': 7890,
    'allow-lan': false,
    mode: 'rule',
    'log-level': 'info',
    proxies,
    'proxy-groups': [{ name: group, type: 'select', proxies: [...names, 'DIRECT'] }],
    rules: [`MATCH,${group}`]
  };
  return stringify(config);
}

// Sing-box 客户端配置：vless 出站（utls + reality）+ direct 兜底
export function buildSingboxJson(userUuid: string, nodes: SubNode[]): string {
  const names = dedupeNames(nodes.map((n) => n.name));
  const outbounds: Record<string, unknown>[] = nodes.map((node, i) => {
    const r = parseReality(node);
    return {
      type: 'vless',
      tag: names[i],
      server: node.serverHost,
      server_port: node.serverPort,
      uuid: userUuid,
      flow: VLESS_FLOW,
      tls: {
        enabled: true,
        server_name: r.sni,
        utls: { enabled: true, fingerprint: r.fp },
        reality: { enabled: true, public_key: r.publicKey, short_id: r.shortId }
      }
    };
  });
  outbounds.push({ type: 'direct', tag: 'direct' });
  return JSON.stringify({ log: { level: 'info' }, outbounds }, null, 2);
}
