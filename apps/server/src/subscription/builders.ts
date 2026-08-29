import { stringify } from 'yaml';
import type {
  Hysteria2Params,
  ShadowsocksParams,
  TuicParams,
  VlessRealityParams
} from '../common/inbound';
import type { ProtocolType } from '../common/constants';

// 订阅用户凭证：vless/tuic 以 uuid 登录；hy2/tuic 密码为 User.password ?? uuid；ss 为入站共享密码
export interface SubUser {
  uuid: string;
  credential: string;
}

// 订阅输出中的入站（paramsJson 已解析归一化；仅含 isPublic 入站）
export interface SubInbound {
  type: ProtocolType;
  tag: string;
  port: number;
  params: Record<string, unknown>;
}

export interface SubNode {
  name: string;
  serverHost: string;
  inbounds: SubInbound[];
}

const REALITY_CLIENT_DEFAULTS = {
  fp: 'chrome'
};

interface SubEntry {
  label: string;
  node: SubNode;
  inbound: SubInbound;
}

// 输出条目名：单入站节点用节点名，多入站节点追加 tag 区分；再全局去重保证 Clash proxy 名唯一
export function entryLabels(nodes: SubNode[]): string[] {
  return dedupeNames(
    nodes.flatMap((node) =>
      node.inbounds.map((inbound) =>
        node.inbounds.length > 1 ? `${node.name}·${inbound.tag}` : node.name
      )
    )
  );
}

function entries(nodes: SubNode[]): SubEntry[] {
  const labels = entryLabels(nodes);
  const list: SubEntry[] = [];
  let i = 0;
  for (const node of nodes) {
    for (const inbound of node.inbounds) {
      list.push({ label: labels[i], node, inbound });
      i += 1;
    }
  }
  return list;
}

// Clash 要求 proxy 名唯一，重名自动追加序号
export function dedupeNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name} ${count + 1}`;
  });
}

// ==============================
// URI（Base64 订阅行）
// ==============================

// vless://<uuid>@<host>:<port>?encryption=none&flow=..&security=reality&sni=..&fp=chrome&pbk=..&sid=..&type=tcp#<label>
function buildVlessUri(user: SubUser, entry: SubEntry): string {
  const p = entry.inbound.params as unknown as VlessRealityParams;
  const params = new URLSearchParams({
    encryption: 'none',
    flow: p.flow,
    security: 'reality',
    sni: p.serverNames[0],
    fp: REALITY_CLIENT_DEFAULTS.fp,
    pbk: p.publicKey,
    sid: p.shortIds[0],
    type: 'tcp'
  });
  return `vless://${user.uuid}@${entry.node.serverHost}:${entry.inbound.port}?${params.toString()}#${encodeURIComponent(entry.label)}`;
}

// hy2://<password>@<host>:<port>?sni=..&alpn=h3&insecure=1[&upmbps=..&downmbps=..]#<label>
function buildHysteria2Uri(user: SubUser, entry: SubEntry): string {
  const p = entry.inbound.params as unknown as Hysteria2Params;
  const params = new URLSearchParams({ sni: p.tls.serverName, alpn: p.tls.alpn.join(',') });
  if (p.tls.insecure) {
    params.set('insecure', '1');
  }
  if (p.upMbps > 0) {
    params.set('upmbps', String(p.upMbps));
  }
  if (p.downMbps > 0) {
    params.set('downmbps', String(p.downMbps));
  }
  return `hy2://${encodeURIComponent(user.credential)}@${entry.node.serverHost}:${entry.inbound.port}?${params.toString()}#${encodeURIComponent(entry.label)}`;
}

// ss://<base64url(method:password)>@<host>:<port>#<label>（SIP002）
function buildShadowsocksUri(entry: SubEntry): string {
  const p = entry.inbound.params as unknown as ShadowsocksParams;
  const userinfo = Buffer.from(`${p.method}:${p.password}`, 'utf8').toString('base64url');
  return `ss://${userinfo}@${entry.node.serverHost}:${entry.inbound.port}#${encodeURIComponent(entry.label)}`;
}

// tuic://<uuid>:<password>@<host>:<port>?congestion_control=bbr&alpn=h3&sni=..&udp_relay_mode=native#<label>
function buildTuicUri(user: SubUser, entry: SubEntry): string {
  const p = entry.inbound.params as unknown as TuicParams;
  const params = new URLSearchParams({
    congestion_control: p.congestionControl,
    alpn: p.tls.alpn.join(','),
    sni: p.tls.serverName,
    udp_relay_mode: 'native'
  });
  if (p.tls.insecure) {
    params.set('allow_insecure', '1');
  }
  return `tuic://${user.uuid}:${encodeURIComponent(user.credential)}@${entry.node.serverHost}:${entry.inbound.port}?${params.toString()}#${encodeURIComponent(entry.label)}`;
}

// 逐入站生成 URI 行（Base64 订阅体）；未知协议跳过（空行）
export function buildUriList(user: SubUser, nodes: SubNode[]): string[] {
  return entries(nodes).map((entry) => {
    switch (entry.inbound.type) {
      case 'VLESS_REALITY':
        return buildVlessUri(user, entry);
      case 'HYSTERIA2':
        return buildHysteria2Uri(user, entry);
      case 'SHADOWSOCKS':
        return buildShadowsocksUri(entry);
      case 'TUIC':
        return buildTuicUri(user, entry);
      default:
        return '';
    }
  });
}

// ==============================
// Clash Meta（mihomo）YAML
// ==============================

function buildClashProxy(user: SubUser, entry: SubEntry): Record<string, unknown> {
  const { serverHost } = entry.node;
  const { port } = entry.inbound;
  switch (entry.inbound.type) {
    case 'VLESS_REALITY': {
      const p = entry.inbound.params as unknown as VlessRealityParams;
      return {
        name: entry.label,
        type: 'vless',
        server: serverHost,
        port,
        uuid: user.uuid,
        flow: p.flow,
        network: 'tcp',
        udp: true,
        tls: true,
        servername: p.serverNames[0],
        'client-fingerprint': REALITY_CLIENT_DEFAULTS.fp,
        'reality-opts': { 'public-key': p.publicKey, 'short-id': p.shortIds[0] }
      };
    }
    case 'HYSTERIA2': {
      const p = entry.inbound.params as unknown as Hysteria2Params;
      return {
        name: entry.label,
        type: 'hysteria2',
        server: serverHost,
        port,
        password: user.credential,
        sni: p.tls.serverName,
        'skip-cert-verify': p.tls.insecure,
        alpn: [...p.tls.alpn],
        ...(p.upMbps > 0 ? { up: `${p.upMbps} Mbps` } : {}),
        ...(p.downMbps > 0 ? { down: `${p.downMbps} Mbps` } : {})
      };
    }
    case 'SHADOWSOCKS': {
      const p = entry.inbound.params as unknown as ShadowsocksParams;
      return {
        name: entry.label,
        type: 'ss',
        server: serverHost,
        port,
        cipher: p.method,
        password: p.password,
        udp: true
      };
    }
    case 'TUIC': {
      const p = entry.inbound.params as unknown as TuicParams;
      return {
        name: entry.label,
        type: 'tuic',
        server: serverHost,
        port,
        uuid: user.uuid,
        password: user.credential,
        sni: p.tls.serverName,
        'skip-cert-verify': p.tls.insecure,
        alpn: [...p.tls.alpn],
        'congestion-controller': p.congestionControl
      };
    }
    default:
      return {};
  }
}

// Clash Meta 客户端配置：完整最小可用（基础设置 + proxies + 策略组 + 兜底规则）
export function buildClashYaml(user: SubUser, nodes: SubNode[]): string {
  const proxies = entries(nodes).map((entry) => buildClashProxy(user, entry));
  const names = proxies.map((p) => p.name as string);
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

// ==============================
// Sing-box 客户端 JSON
// ==============================

function buildSingboxOutbound(user: SubUser, entry: SubEntry): Record<string, unknown> {
  const { serverHost } = entry.node;
  const { port } = entry.inbound;
  switch (entry.inbound.type) {
    case 'VLESS_REALITY': {
      const p = entry.inbound.params as unknown as VlessRealityParams;
      return {
        type: 'vless',
        tag: entry.label,
        server: serverHost,
        server_port: port,
        uuid: user.uuid,
        flow: p.flow,
        tls: {
          enabled: true,
          server_name: p.serverNames[0],
          utls: { enabled: true, fingerprint: REALITY_CLIENT_DEFAULTS.fp },
          reality: { enabled: true, public_key: p.publicKey, short_id: p.shortIds[0] }
        }
      };
    }
    case 'HYSTERIA2': {
      const p = entry.inbound.params as unknown as Hysteria2Params;
      return {
        type: 'hysteria2',
        tag: entry.label,
        server: serverHost,
        server_port: port,
        password: user.credential,
        ...(p.upMbps > 0 ? { up_mbps: p.upMbps } : {}),
        ...(p.downMbps > 0 ? { down_mbps: p.downMbps } : {}),
        tls: {
          enabled: true,
          server_name: p.tls.serverName,
          alpn: p.tls.alpn,
          insecure: p.tls.insecure
        }
      };
    }
    case 'SHADOWSOCKS': {
      const p = entry.inbound.params as unknown as ShadowsocksParams;
      return {
        type: 'shadowsocks',
        tag: entry.label,
        server: serverHost,
        server_port: port,
        method: p.method,
        password: p.password
      };
    }
    case 'TUIC': {
      const p = entry.inbound.params as unknown as TuicParams;
      return {
        type: 'tuic',
        tag: entry.label,
        server: serverHost,
        server_port: port,
        uuid: user.uuid,
        password: user.credential,
        congestion_control: p.congestionControl,
        tls: {
          enabled: true,
          server_name: p.tls.serverName,
          alpn: p.tls.alpn,
          insecure: p.tls.insecure
        }
      };
    }
    default:
      return {};
  }
}

// Sing-box 客户端配置：四协议出站 + direct 兜底
export function buildSingboxJson(user: SubUser, nodes: SubNode[]): string {
  const outbounds: Record<string, unknown>[] = entries(nodes).map((entry) =>
    buildSingboxOutbound(user, entry)
  );
  outbounds.push({ type: 'direct', tag: 'direct' });
  return JSON.stringify({ log: { level: 'info' }, outbounds }, null, 2);
}
