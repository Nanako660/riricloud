import { parseDocument, stringify } from 'yaml';
import type {
  Hysteria2Params,
  InboundTransport,
  NaiveParams,
  ShadowtlsParams,
  ShadowsocksParams,
  TrojanParams,
  TuicParams,
  VlessParams,
  VmessParams
} from '../common/inbound';
import type { ProtocolType } from '../common/constants';
import {
  buildClientTls,
  buildClientTransport,
  buildShadowsocksClientPassword,
  normalizeShadowsocksPassword,
  parseDest
} from '../common/inbound';
import { deepMerge } from '../common/utils';

// 订阅用户凭证：vless/vmess 以 uuid 登录；hy2/trojan/tuic/naive 密码为 User.password ?? uuid；ss 为入站密码
export interface SubUser {
  uuid: string;
  email?: string;
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
  tags?: string[];
  level?: number;
  inbounds: SubInbound[];
}

// 订阅编译的主输入：Line 已经解析出对外端点与自身协议参数。
export interface SubLine {
  id?: string;
  name: string;
  type?: 'DIRECT' | 'RELAY' | string;
  relayMode?: 'BLIND_FORWARD' | 'PROTOCOL_PROXY' | string | null;
  protocolType?: ProtocolType;
  params?: Record<string, unknown>;
  endpointOverrideEnabled?: boolean;
  serverHost: string;
  serverPort: number;
  serverName?: string | null;
  host?: string | null;
  trafficRate?: number;
  tags?: string[];
  level?: number;
  // 旧版调用方兼容字段；新代码使用 protocolType + params。
  targetInbound?: SubInbound;
}

export interface SubscriptionTemplateConfig {
  proxyGroupsJson?: string;
  ruleSetsJson?: string;
  dnsConfigJson?: string;
  customInjectYaml?: string | null;
  customInjectJson?: string | null;
}

function parseJson<T>(value: string | undefined, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function matchesProxyFilter(entry: SubEntry, group: Record<string, unknown>): boolean {
  const filter = group.filter;
  if (typeof filter !== 'string' || !filter.trim()) return true;
  try {
    return new RegExp(filter, 'i').test(entry.node.name) || new RegExp(filter, 'i').test(entry.inbound.tag);
  } catch {
    return false;
  }
}

function templateGroups(template: SubscriptionTemplateConfig | undefined): Array<Record<string, unknown>> {
  return parseJson<unknown[]>(template?.proxyGroupsJson, [])
    .filter((group): group is Record<string, unknown> => !!group && typeof group === 'object' && !Array.isArray(group));
}

function templateRules(template: SubscriptionTemplateConfig | undefined): Array<Record<string, unknown>> {
  return parseJson<unknown[]>(template?.ruleSetsJson, [])
    .filter((rule): rule is Record<string, unknown> => !!rule && typeof rule === 'object' && !Array.isArray(rule));
}

function templateDns(template: SubscriptionTemplateConfig | undefined): Record<string, unknown> {
  const dns = parseJson<unknown>(template?.dnsConfigJson, {});
  return dns && typeof dns === 'object' && !Array.isArray(dns) ? (dns as Record<string, unknown>) : {};
}

function parseYamlObject(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = parseDocument(value).toJS();
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const REALITY_CLIENT_DEFAULTS = {
  fp: 'chrome'
};

interface SubEntry {
  label: string;
  node: SubNode;
  inbound: SubInbound;
  line?: SubLine;
}

type SubscriptionSource = SubNode | SubLine;

function isSubLine(source: SubscriptionSource): source is SubLine {
  return 'protocolType' in source || 'targetInbound' in source;
}

function lineInbound(line: SubLine): SubInbound {
  const legacy = line.targetInbound;
  return {
    type: line.protocolType ?? legacy?.type ?? 'VLESS',
    tag: legacy?.tag ?? `line-${line.id ?? line.name}`,
    port: line.serverPort,
    params: line.params ?? legacy?.params ?? {}
  };
}

function formatLineName(name: string, trafficRate?: number): string {
  return trafficRate !== undefined && trafficRate !== 1 ? `${name} [${trafficRate}x]` : name;
}

function endpointHost(entry: SubEntry): string {
  return entry.line?.serverHost ?? entry.node.serverHost;
}

function endpointPort(entry: SubEntry): number {
  return entry.line?.serverPort ?? entry.inbound.port;
}

function effectiveServerName(entry: SubEntry, fallback?: string): string | undefined {
  return entry.line && entry.line.endpointOverrideEnabled !== false ? entry.line.serverName || fallback : fallback;
}

function effectiveTransportHost(entry: SubEntry, fallback?: string): string | undefined {
  return entry.line && entry.line.endpointOverrideEnabled !== false ? entry.line.host || fallback : fallback;
}

function shadowtlsHandshakeHost(entry: SubEntry, params: ShadowtlsParams): string {
  const handshakeHost = parseDest(params.handshakeDest).host;
  return effectiveServerName(entry, handshakeHost) || handshakeHost;
}

function shadowtlsInnerPassword(params: ShadowtlsParams): string {
  return normalizeShadowsocksPassword(params.inner.method, params.inner.password);
}

function buildClashTransportOptions(
  transport: InboundTransport | undefined,
  hostOverride?: string | null
): Record<string, unknown> | undefined {
  const client = buildClientTransport(transport, hostOverride);
  if (!client || typeof client.type !== 'string') return undefined;

  const path = typeof client.path === 'string' && client.path ? client.path : '/';
  const headers = client.headers && typeof client.headers === 'object' && !Array.isArray(client.headers)
    ? client.headers
    : undefined;

  if (client.type === 'ws') {
    const options: Record<string, unknown> = { path };
    if (headers) options.headers = headers;
    if (typeof client.max_early_data === 'number') options['max-early-data'] = client.max_early_data;
    if (typeof client.early_data_header_name === 'string') options['early-data-header-name'] = client.early_data_header_name;
    return { 'ws-opts': options };
  }

  if (client.type === 'grpc') {
    return { 'grpc-opts': { 'grpc-service-name': typeof client.service_name === 'string' ? client.service_name : '' } };
  }

  if (client.type === 'http') {
    return { 'http-opts': { path, ...(headers ? { headers } : {}) } };
  }

  if (client.type === 'httpupgrade') {
    const options: Record<string, unknown> = { path };
    if (typeof client.host === 'string' && client.host) options.host = client.host;
    if (headers) options.headers = headers;
    return { 'httpupgrade-opts': options };
  }

  return undefined;
}

// 输出条目名：单入站节点用节点名，多入站节点追加 tag 区分；再全局去重保证 Clash proxy 名唯一
export function entryLabels(nodes: SubscriptionSource[]): string[] {
  return dedupeNames(
    nodes.flatMap((source) => {
    if (isSubLine(source)) return [formatLineName(source.name, source.trafficRate)];
      return source.inbounds.map((inbound) =>
        source.inbounds.length > 1 ? `${source.name}·${inbound.tag}` : source.name
      );
    }
    )
  );
}

function entries(nodes: SubscriptionSource[]): SubEntry[] {
  const labels = entryLabels(nodes);
  const list: SubEntry[] = [];
  let i = 0;
  for (const source of nodes) {
    if (isSubLine(source)) {
      const inbound = lineInbound(source);
      const node: SubNode = { name: source.name, serverHost: source.serverHost, inbounds: [inbound], tags: source.tags, level: source.level };
      list.push({ label: labels[i], node, inbound, line: source });
      i += 1;
      continue;
    }
    for (const inbound of source.inbounds) {
      list.push({ label: labels[i], node: source, inbound });
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

function buildVlessUri(user: SubUser, entry: SubEntry): string {
  const p = entry.inbound.params as unknown as VlessParams;
  const transport = p.transport?.type || 'tcp';
  const tls = p.tls;

  const params = new URLSearchParams({
    encryption: 'none',
    type: transport
  });

  if (p.flow) {
    params.set('flow', p.flow);
  }

  if (transport === 'ws' && p.transport?.path) {
    params.set('path', p.transport.path);
    const host = effectiveTransportHost(entry, p.transport.host);
    if (host) params.set('host', host);
  } else if (transport === 'grpc' && p.transport?.serviceName) {
    params.set('serviceName', p.transport.serviceName);
  } else if (transport === 'httpupgrade' && p.transport?.path) {
    params.set('path', p.transport.path);
    const host = effectiveTransportHost(entry, p.transport.host);
    if (host) params.set('host', host);
  }

  if (tls && tls.enabled) {
    if (tls.mode === 'reality' && tls.reality) {
      params.set('security', 'reality');
      params.set('sni', effectiveServerName(entry, tls.serverName || tls.reality.serverNames[0])!);
      params.set('fp', REALITY_CLIENT_DEFAULTS.fp);
      params.set('pbk', tls.reality.publicKey);
      params.set('sid', tls.reality.shortIds[0]);
    } else {
      params.set('security', 'tls');
      const serverName = effectiveServerName(entry, tls.serverName);
      if (serverName) params.set('sni', serverName);
      if (tls.alpn && tls.alpn.length) params.set('alpn', tls.alpn.join(','));
      if (tls.insecure) params.set('allowInsecure', '1');
    }
  }

  return `vless://${user.uuid}@${endpointHost(entry)}:${endpointPort(entry)}?${params.toString()}#${encodeURIComponent(entry.label)}`;
}

function buildVmessUri(user: SubUser, entry: SubEntry): string {
  const p = entry.inbound.params as unknown as VmessParams;
  const transport = p.transport?.type || 'tcp';
  const tls = p.tls;

  const vmessJson = {
    v: '2',
    ps: entry.label,
    add: endpointHost(entry),
    port: endpointPort(entry),
    id: user.uuid,
    aid: p.alterId || 0,
    scy: 'auto',
    net: transport === 'httpupgrade' ? 'http' : transport,
    type: 'none',
    host: effectiveTransportHost(entry, p.transport?.host) || '',
    path: p.transport?.path || (transport === 'grpc' ? p.transport?.serviceName : '') || '',
    tls: tls && tls.enabled ? 'tls' : '',
    sni: effectiveServerName(entry, tls?.serverName) || ''
  };

  const b64 = Buffer.from(JSON.stringify(vmessJson), 'utf8').toString('base64');
  return `vmess://${b64}`;
}

function buildTrojanUri(user: SubUser, entry: SubEntry): string {
  const p = entry.inbound.params as unknown as TrojanParams;
  const transport = p.transport?.type || 'tcp';
  const tls = p.tls;

  const params = new URLSearchParams({
    type: transport
  });

  const serverName = effectiveServerName(entry, tls?.serverName);
  if (serverName) {
    params.set('sni', serverName);
  }
  if (tls?.alpn && tls.alpn.length) {
    params.set('alpn', tls.alpn.join(','));
  }
  if (tls?.insecure) {
    params.set('allowInsecure', '1');
  }

  if (transport === 'ws' && p.transport?.path) {
    params.set('path', p.transport.path);
    const host = effectiveTransportHost(entry, p.transport.host);
    if (host) params.set('host', host);
  } else if (transport === 'grpc' && p.transport?.serviceName) {
    params.set('serviceName', p.transport.serviceName);
  } else if (transport === 'httpupgrade' && p.transport?.path) {
    params.set('path', p.transport.path);
    const host = effectiveTransportHost(entry, p.transport.host);
    if (host) params.set('host', host);
  }

  return `trojan://${encodeURIComponent(user.credential)}@${endpointHost(entry)}:${endpointPort(entry)}?${params.toString()}#${encodeURIComponent(entry.label)}`;
}

function buildHysteria2Uri(user: SubUser, entry: SubEntry): string {
  const p = entry.inbound.params as unknown as Hysteria2Params;
  const params = new URLSearchParams();
  const serverName = effectiveServerName(entry, p.tls?.serverName);
  if (serverName) {
    params.set('sni', serverName);
  }
  if (p.tls?.alpn && p.tls.alpn.length) {
    params.set('alpn', p.tls.alpn.join(','));
  }
  if (p.tls?.insecure) {
    params.set('insecure', '1');
  }
  if (p.upMbps && p.upMbps > 0) {
    params.set('upmbps', String(p.upMbps));
  }
  if (p.downMbps && p.downMbps > 0) {
    params.set('downmbps', String(p.downMbps));
  }
  if (p.obfs && p.obfs.password) {
    params.set('obfs', p.obfs.type || 'salamander');
    params.set('obfs-password', p.obfs.password);
  }
  const qs = params.toString();
  return `hy2://${encodeURIComponent(user.credential)}@${endpointHost(entry)}:${endpointPort(entry)}${qs ? `?${qs}` : ''}#${encodeURIComponent(entry.label)}`;
}

function buildShadowsocksUri(user: SubUser, entry: SubEntry): string {
  const p = entry.inbound.params as unknown as ShadowsocksParams;
  const password = p.mode === 'multi-user'
    ? buildShadowsocksClientPassword(p.method, p.password || '', user.credential, user.uuid)
    : normalizeShadowsocksPassword(p.method, p.password || '');
  const userinfo = Buffer.from(`${p.method}:${password}`, 'utf8').toString('base64url');
  return `ss://${userinfo}@${endpointHost(entry)}:${endpointPort(entry)}#${encodeURIComponent(entry.label)}`;
}

function buildTuicUri(user: SubUser, entry: SubEntry): string {
  const p = entry.inbound.params as unknown as TuicParams;
  const params = new URLSearchParams({
    congestion_control: p.congestionControl || 'bbr',
    udp_relay_mode: 'native'
  });
  const serverName = effectiveServerName(entry, p.tls?.serverName);
  if (serverName) {
    params.set('sni', serverName);
  }
  if (p.tls?.alpn && p.tls.alpn.length) {
    params.set('alpn', p.tls.alpn.join(','));
  }
  if (p.tls?.insecure) {
    params.set('allow_insecure', '1');
  }
  return `tuic://${user.uuid}:${encodeURIComponent(user.credential)}@${endpointHost(entry)}:${endpointPort(entry)}?${params.toString()}#${encodeURIComponent(entry.label)}`;
}

function buildNaiveUri(user: SubUser, entry: SubEntry): string {
  const username = user.email || user.uuid;
  return `naive+https://${encodeURIComponent(username)}:${encodeURIComponent(user.credential)}@${endpointHost(entry)}:${endpointPort(entry)}#${encodeURIComponent(entry.label)}`;
}

function buildShadowtlsUri(user: SubUser, entry: SubEntry): string {
  const p = entry.inbound.params as unknown as ShadowtlsParams;
  const plugin = `shadow-tls;host=${shadowtlsHandshakeHost(entry, p)};password=${user.credential};version=3`;
  const userinfo = Buffer.from(`${p.inner.method}:${shadowtlsInnerPassword(p)}`, 'utf8').toString('base64url');
  const query = new URLSearchParams({ plugin });
  return `ss://${userinfo}@${endpointHost(entry)}:${endpointPort(entry)}?${query.toString()}#${encodeURIComponent(entry.label)}`;
}

// 逐入站生成 URI 行（Base64 订阅体）；未知或本地协议跳过（空行）
export function buildUriList(user: SubUser, nodes: SubscriptionSource[]): string[] {
  return entries(nodes)
    .map((entry) => {
      switch (entry.inbound.type) {
        case 'VLESS':
        case 'VLESS_REALITY' as ProtocolType:
          return buildVlessUri(user, entry);
        case 'VMESS':
          return buildVmessUri(user, entry);
        case 'TROJAN':
          return buildTrojanUri(user, entry);
        case 'HYSTERIA2':
          return buildHysteria2Uri(user, entry);
        case 'SHADOWSOCKS':
          return buildShadowsocksUri(user, entry);
        case 'TUIC':
          return buildTuicUri(user, entry);
        case 'NAIVE':
          return buildNaiveUri(user, entry);
        case 'SHADOWTLS':
          return buildShadowtlsUri(user, entry);
        default:
          return '';
      }
    })
    .filter((uri) => uri.length > 0);
}

// ==============================
// Clash Meta（mihomo）YAML
// ==============================

function buildClashProxy(user: SubUser, entry: SubEntry): Record<string, unknown> {
  const serverHost = endpointHost(entry);
  const port = endpointPort(entry);

  switch (entry.inbound.type) {
    case 'VLESS':
    case 'VLESS_REALITY' as ProtocolType: {
      const p = entry.inbound.params as unknown as VlessParams;
      const transport = p.transport?.type || 'tcp';
      const tls = p.tls;

      const proxy: Record<string, unknown> = {
        name: entry.label,
        type: 'vless',
        server: serverHost,
        port,
        uuid: user.uuid,
        network: transport === 'httpupgrade' ? 'ws' : transport,
        udp: true
      };

      if (p.flow) {
        proxy.flow = p.flow;
      }

      if (tls && tls.enabled) {
        proxy.tls = true;
        const serverName = effectiveServerName(entry, tls.serverName);
        if (serverName) proxy.servername = serverName;
        if (tls.insecure) proxy['skip-cert-verify'] = true;
        if (tls.alpn) proxy.alpn = [...tls.alpn];

        if (tls.mode === 'reality' && tls.reality) {
          proxy.servername = effectiveServerName(entry, tls.serverName || tls.reality.serverNames[0]);
          proxy['client-fingerprint'] = REALITY_CLIENT_DEFAULTS.fp;
          proxy['reality-opts'] = {
            'public-key': tls.reality.publicKey,
            'short-id': tls.reality.shortIds[0]
          };
        }
      }

      Object.assign(proxy, buildClashTransportOptions(p.transport, effectiveTransportHost(entry)));

      return proxy;
    }

    case 'VMESS': {
      const p = entry.inbound.params as unknown as VmessParams;
      const transport = p.transport?.type || 'tcp';
      const tls = p.tls;

      const proxy: Record<string, unknown> = {
        name: entry.label,
        type: 'vmess',
        server: serverHost,
        port,
        uuid: user.uuid,
        alterId: p.alterId || 0,
        cipher: 'auto',
        network: transport === 'httpupgrade' ? 'ws' : transport,
        udp: true
      };

      if (tls && tls.enabled) {
        proxy.tls = true;
        const serverName = effectiveServerName(entry, tls.serverName);
        if (serverName) proxy.servername = serverName;
        if (tls.insecure) proxy['skip-cert-verify'] = true;
      }

      Object.assign(proxy, buildClashTransportOptions(p.transport, effectiveTransportHost(entry)));

      return proxy;
    }

    case 'TROJAN': {
      const p = entry.inbound.params as unknown as TrojanParams;
      const transport = p.transport?.type || 'tcp';
      const tls = p.tls;

      const proxy: Record<string, unknown> = {
        name: entry.label,
        type: 'trojan',
        server: serverHost,
        port,
        password: user.credential,
        udp: true,
        network: transport === 'httpupgrade' ? 'ws' : transport
      };

      const serverName = effectiveServerName(entry, tls?.serverName);
      if (serverName) proxy.sni = serverName;
      if (tls?.insecure) proxy['skip-cert-verify'] = true;
      if (tls?.alpn) proxy.alpn = [...tls.alpn];

      Object.assign(proxy, buildClashTransportOptions(p.transport, effectiveTransportHost(entry)));

      return proxy;
    }

    case 'HYSTERIA2': {
      const p = entry.inbound.params as unknown as Hysteria2Params;
      const proxy: Record<string, unknown> = {
        name: entry.label,
        type: 'hysteria2',
        server: serverHost,
        port,
        password: user.credential,
        sni: effectiveServerName(entry, p.tls?.serverName) || '',
        'skip-cert-verify': p.tls?.insecure ?? false,
        alpn: p.tls?.alpn ? [...p.tls.alpn] : ['h3'],
        ...(p.upMbps && p.upMbps > 0 ? { up: `${p.upMbps} Mbps` } : {}),
        ...(p.downMbps && p.downMbps > 0 ? { down: `${p.downMbps} Mbps` } : {})
      };
      if (p.obfs && p.obfs.password) {
        proxy.obfs = p.obfs.type || 'salamander';
        proxy['obfs-password'] = p.obfs.password;
      }
      return proxy;
    }

    case 'SHADOWSOCKS': {
      const p = entry.inbound.params as unknown as ShadowsocksParams;
      const password = p.mode === 'multi-user'
        ? buildShadowsocksClientPassword(p.method, p.password || '', user.credential, user.uuid)
        : normalizeShadowsocksPassword(p.method, p.password || '');
      return {
        name: entry.label,
        type: 'ss',
        server: serverHost,
        port,
        cipher: p.method,
        password,
        udp: true
      };
    }

    case 'SHADOWTLS': {
      const p = entry.inbound.params as unknown as ShadowtlsParams;
      return {
        name: entry.label,
        type: 'ss',
        server: serverHost,
        port,
        cipher: p.inner.method,
        password: shadowtlsInnerPassword(p),
        udp: true,
        plugin: 'shadow-tls',
        'client-fingerprint': REALITY_CLIENT_DEFAULTS.fp,
        'plugin-opts': {
          host: shadowtlsHandshakeHost(entry, p),
          password: user.credential,
          version: 3
        }
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
        sni: effectiveServerName(entry, p.tls?.serverName) || '',
        'skip-cert-verify': p.tls?.insecure ?? false,
        alpn: p.tls?.alpn ? [...p.tls.alpn] : ['h3'],
        'congestion-controller': p.congestionControl || 'bbr',
        'udp-relay-mode': 'native'
      };
    }

    default:
      return {};
  }
}

// Clash Meta 客户端配置：完整最小可用（基础设置 + proxies + 策略组 + 兜底规则）
export function buildClashYaml(user: SubUser, nodes: SubscriptionSource[], template?: SubscriptionTemplateConfig): string {
  const allEntries = entries(nodes);
  const proxies = allEntries
    .map((entry) => buildClashProxy(user, entry))
    .filter((p) => Object.keys(p).length > 0);

  const names = proxies.map((p) => p.name as string);
  const defaultGroup = '节点选择';
  const groups = templateGroups(template);
  const proxyGroups = groups.length
    ? groups.map((group) => {
        const groupEntries = allEntries.filter((entry) => matchesProxyFilter(entry, group));
        const groupNames = groupEntries
          .map((entry) => names[allEntries.indexOf(entry)])
          .filter((name): name is string => !!name && names.includes(name));
        const type = typeof group.type === 'string' ? group.type : 'select';
        return {
          name: typeof group.name === 'string' && group.name.trim() ? group.name : defaultGroup,
          type,
          proxies: groupNames.length ? groupNames : [...names, 'DIRECT'],
          ...(typeof group.url === 'string' ? { url: group.url } : {}),
          ...(typeof group.interval === 'number' ? { interval: group.interval } : {}),
          ...(typeof group.tolerance === 'number' ? { tolerance: group.tolerance } : {})
        };
      })
    : [{ name: defaultGroup, type: 'select', proxies: [...names, 'DIRECT'] }];
  const primaryGroup = (proxyGroups[0]?.name as string) || defaultGroup;
  const configuredRules = templateRules(template);
  const rules = configuredRules.length
    ? configuredRules
        .filter((rule) => rule.enabled !== false)
        .flatMap((rule) => {
          const type = typeof rule.type === 'string' ? rule.type.toUpperCase() : 'DOMAIN-SUFFIX';
          const target = typeof rule.target === 'string' && rule.target.trim() ? rule.target : primaryGroup;
          const values = Array.isArray(rule.rules) ? rule.rules.filter((item): item is string => typeof item === 'string') : [];
          return type === 'MATCH' || type === 'FINAL'
            ? [`MATCH,${target}`]
            : values.map((value) => `${type},${value},${target}`);
        })
    : [`MATCH,${primaryGroup}`];
  const config: Record<string, unknown> = {
    'mixed-port': 7890,
    'allow-lan': false,
    mode: 'rule',
    'log-level': 'info',
    proxies,
    'proxy-groups': proxyGroups,
    rules,
    ...(Object.keys(templateDns(template)).length ? { dns: templateDns(template) } : {})
  };
  if (template?.customInjectYaml?.trim()) {
    const parsed = parseYamlObject(template.customInjectYaml);
    return stringify(deepMerge(config, parsed));
  }
  return stringify(config);
}

// ==============================
// Sing-box 客户端 JSON
// ==============================

function buildSingboxOutbound(user: SubUser, entry: SubEntry): Record<string, unknown> {
  const serverHost = endpointHost(entry);
  const port = endpointPort(entry);

  switch (entry.inbound.type) {
    case 'VLESS':
    case 'VLESS_REALITY' as ProtocolType: {
      const p = entry.inbound.params as unknown as VlessParams;
      const transport = p.transport?.type !== 'tcp' && p.transport ? p.transport : undefined;
      const tls = p.tls;

      const outbound: Record<string, unknown> = {
        type: 'vless',
        tag: entry.label,
        server: serverHost,
        server_port: port,
        uuid: user.uuid
      };

      if (p.flow) {
        outbound.flow = p.flow;
      }

      const clientTls = buildClientTls(tls, effectiveServerName(entry));
      if (clientTls) outbound.tls = clientTls;
      const clientTransport = buildClientTransport(transport, effectiveTransportHost(entry));
      if (clientTransport) outbound.transport = clientTransport;

      return outbound;
    }

    case 'VMESS': {
      const p = entry.inbound.params as unknown as VmessParams;
      const transport = p.transport?.type !== 'tcp' && p.transport ? p.transport : undefined;
      const tls = p.tls;

      const outbound: Record<string, unknown> = {
        type: 'vmess',
        tag: entry.label,
        server: serverHost,
        server_port: port,
        uuid: user.uuid,
        alter_id: p.alterId || 0,
        security: 'auto'
      };

      const clientTls = buildClientTls(tls, effectiveServerName(entry));
      if (clientTls) outbound.tls = clientTls;
      const clientTransport = buildClientTransport(transport, effectiveTransportHost(entry));
      if (clientTransport) outbound.transport = clientTransport;

      return outbound;
    }

    case 'TROJAN': {
      const p = entry.inbound.params as unknown as TrojanParams;
      const transport = p.transport?.type !== 'tcp' && p.transport ? p.transport : undefined;
      const tls = p.tls;

      const outbound: Record<string, unknown> = {
        type: 'trojan',
        tag: entry.label,
        server: serverHost,
        server_port: port,
        password: user.credential
      };

      const clientTls = buildClientTls(tls, effectiveServerName(entry));
      if (clientTls) outbound.tls = clientTls;
      const clientTransport = buildClientTransport(transport, effectiveTransportHost(entry));
      if (clientTransport) outbound.transport = clientTransport;

      return outbound;
    }

    case 'HYSTERIA2': {
      const p = entry.inbound.params as unknown as Hysteria2Params;
      const outbound: Record<string, unknown> = {
        type: 'hysteria2',
        tag: entry.label,
        server: serverHost,
        server_port: port,
        password: user.credential,
        ...(p.upMbps && p.upMbps > 0 ? { up_mbps: p.upMbps } : {}),
        ...(p.downMbps && p.downMbps > 0 ? { down_mbps: p.downMbps } : {}),
        ...(p.obfs ? { obfs: p.obfs } : {})
      };
      const clientTls = buildClientTls(p.tls, effectiveServerName(entry));
      if (clientTls) outbound.tls = clientTls;
      return outbound;
    }

    case 'SHADOWSOCKS': {
      const p = entry.inbound.params as unknown as ShadowsocksParams;
      const password = p.mode === 'multi-user'
        ? buildShadowsocksClientPassword(p.method, p.password || '', user.credential, user.uuid)
        : normalizeShadowsocksPassword(p.method, p.password || '');
      return {
        type: 'shadowsocks',
        tag: entry.label,
        server: serverHost,
        server_port: port,
        method: p.method,
        password
      };
    }

    case 'SHADOWTLS': {
      const p = entry.inbound.params as unknown as ShadowtlsParams;
      return {
        type: 'shadowsocks',
        tag: entry.label,
        server: serverHost,
        server_port: port,
        method: p.inner.method,
        password: shadowtlsInnerPassword(p),
        detour: `${entry.label} · ShadowTLS`
      };
    }

    case 'TUIC': {
      const p = entry.inbound.params as unknown as TuicParams;
      const outbound: Record<string, unknown> = {
        type: 'tuic',
        tag: entry.label,
        server: serverHost,
        server_port: port,
        uuid: user.uuid,
        password: user.credential,
        congestion_control: p.congestionControl || 'bbr',
        ...(p.zeroRttHandshake ? { zero_rtt_handshake: true } : {})
      };
      const clientTls = buildClientTls(p.tls, effectiveServerName(entry));
      if (clientTls) outbound.tls = clientTls;
      return outbound;
    }

    case 'NAIVE': {
      const p = entry.inbound.params as unknown as NaiveParams;
      const outbound: Record<string, unknown> = {
        type: 'naive',
        tag: entry.label,
        server: serverHost,
        server_port: port,
        username: user.email || user.uuid,
        password: user.credential
      };
      const clientTls = buildClientTls(p.tls, effectiveServerName(entry), { includeAlpn: false, includeInsecure: false });
      if (clientTls) outbound.tls = clientTls;
      return outbound;
    }

    default:
      return {};
  }
}

function buildShadowtlsTransportOutbound(entry: SubEntry, user: SubUser): Record<string, unknown> {
  const p = entry.inbound.params as unknown as ShadowtlsParams;
  return {
    type: 'shadowtls',
    tag: `${entry.label} · ShadowTLS`,
    server: endpointHost(entry),
    server_port: endpointPort(entry),
    version: 3,
    password: user.credential,
    tls: {
      enabled: true,
      server_name: shadowtlsHandshakeHost(entry, p)
    }
  };
}

// Sing-box 客户端配置：多协议出站 + direct 兜底
export function buildSingboxJson(user: SubUser, nodes: SubscriptionSource[], template?: SubscriptionTemplateConfig): string {
  const allEntries = entries(nodes);
  const primaryOutbounds = allEntries
    .map((entry) => buildSingboxOutbound(user, entry))
    .filter((o) => Object.keys(o).length > 0);
  const outbounds: Record<string, unknown>[] = [
    ...primaryOutbounds,
    ...allEntries
      .filter((entry) => entry.inbound.type === 'SHADOWTLS')
      .map((entry) => buildShadowtlsTransportOutbound(entry, user))
  ];

  const names = primaryOutbounds.map((outbound) => outbound.tag as string);
  const groups = templateGroups(template);
  const strategyOutbounds = groups.length
    ? groups.map((group) => {
        const type = typeof group.type === 'string' ? group.type.toLowerCase() : 'selector';
        const outboundType = type === 'url-test' ? 'urltest' : 'selector';
        return {
          type: outboundType,
          tag: typeof group.name === 'string' && group.name.trim() ? group.name : '节点选择',
          outbounds: [...names],
          ...(outboundType === 'urltest'
            ? {
                url: typeof group.url === 'string' ? group.url : 'https://www.gstatic.com/generate_204',
                interval: typeof group.interval === 'number' ? `${group.interval}s` : '5m'
              }
            : {})
        };
      })
    : [{ type: 'selector', tag: '节点选择', outbounds: [...names] }];
  const primaryGroup = (strategyOutbounds[0]?.tag as string) || '节点选择';
  const routeTarget = (target: string): string => {
    if (target.toUpperCase() === 'DIRECT') return 'direct';
    if (target.toUpperCase() === 'REJECT') return 'block';
    return target;
  };
  outbounds.push({ type: 'direct', tag: 'direct' });
  outbounds.push({ type: 'block', tag: 'block' });
  outbounds.push(...strategyOutbounds);
  const routeRules: Array<Record<string, unknown>> = templateRules(template)
    .filter((rule) => rule.enabled !== false)
    .flatMap((rule): Array<Record<string, unknown>> => {
      const target = routeTarget(typeof rule.target === 'string' && rule.target.trim() ? rule.target : primaryGroup);
      const values = Array.isArray(rule.rules) ? rule.rules.filter((item): item is string => typeof item === 'string') : [];
      const type = typeof rule.type === 'string' ? rule.type.toLowerCase() : 'domain_suffix';
      if (type === 'match' || type === 'final') return [{ action: 'route', outbound: target }];
      if (type === 'geosite') return [{ rule_set: values, outbound: target }];
      if (type === 'ip-cidr' || type === 'ip_cidr') return [{ ip_cidr: values, outbound: target }];
      return [{ domain_suffix: values, outbound: target }];
    });
  const config: Record<string, unknown> = {
    log: { level: 'info' },
    dns: templateDns(template),
    outbounds,
    route: { rules: routeRules.length ? routeRules : [{ action: 'route', outbound: primaryGroup }] }
  };
  if (template?.customInjectJson?.trim()) {
    const parsed = JSON.parse(template.customInjectJson) as Record<string, unknown>;
    return JSON.stringify(deepMerge(config, parsed), null, 2);
  }
  return JSON.stringify(config, null, 2);
}
