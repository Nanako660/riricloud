import { z } from 'zod';
import type { ApiLine, ProtocolType } from '@/lib/api';
import type { InboundParams, ProtocolType as NodeProtocolType } from '../../nodes/use-nodes';

export const PROTOCOL_TYPES = [
  'VLESS', 'VMESS', 'TROJAN', 'HYSTERIA2', 'TUIC', 'SHADOWSOCKS',
  'NAIVE', 'SHADOWTLS', 'MIXED', 'SOCKS', 'HTTP', 'DIRECT'
] as const satisfies readonly ProtocolType[];

export const PROTOCOL_LABELS: Record<ProtocolType, string> = {
  VLESS: 'VLESS / Reality', VMESS: 'VMess', TROJAN: 'Trojan', HYSTERIA2: 'Hysteria 2', TUIC: 'TUIC v5',
  SHADOWSOCKS: 'Shadowsocks', NAIVE: 'NaiveProxy', SHADOWTLS: 'ShadowTLS', MIXED: 'Mixed', SOCKS: 'SOCKS5',
  HTTP: 'HTTP', DIRECT: 'Direct'
};

const optionalPort = z.preprocess(
  (value) => value === '' || value === null || value === undefined ? undefined : value,
  z.coerce.number().int().min(1).max(65535).optional()
);

const optionalNonNegative = z.preprocess(
  (value) => value === '' || value === null || value === undefined ? undefined : value,
  z.coerce.number().int().min(0).optional()
);

const headersSchema = z.array(z.object({ key: z.string(), value: z.string() }));

export const lineFormSchema = z.object({
  name: z.string().trim().min(1, '请输入线路名称'),
  tag: z.string().trim().max(64, 'Tag 不超过 64 字符'),
  listen: z.string().trim().min(1, '请输入监听地址').max(64, '监听地址不超过 64 字符'),
  type: z.enum(['DIRECT', 'RELAY']),
  protocolType: z.enum(PROTOCOL_TYPES),
  relayMode: z.enum(['BLIND_FORWARD', 'PROTOCOL_PROXY']).optional(),
  entryNodeId: z.string().optional(),
  entryPort: optionalPort,
  exitNodeId: z.string().optional(),
  exitPort: optionalPort,

  transportType: z.enum(['tcp', 'ws', 'grpc', 'http', 'httpupgrade']),
  wsPath: z.string(),
  wsHost: z.string(),
  wsHeaders: headersSchema,
  wsMaxEarlyData: optionalNonNegative,
  wsEarlyDataHeaderName: z.string(),
  grpcServiceName: z.string(),
  httpPath: z.string(),
  httpHost: z.string(),
  httpHeaders: headersSchema,

  tlsMode: z.enum(['none', 'tls', 'reality', 'acme']),
  tlsServerName: z.string(),
  tlsCertPath: z.string(),
  tlsKeyPath: z.string(),
  tlsAlpn: z.string(),
  tlsInsecure: z.boolean(),
  realityDest: z.string(),
  realityPrivateKey: z.string(),
  realityPublicKey: z.string(),
  realityShortIds: z.string(),
  realityServerNames: z.string(),
  acmeDomain: z.string(),
  acmeEmail: z.string(),
  acmeProvider: z.string(),

  vlessFlow: z.string(),
  vmessAlterId: optionalNonNegative,
  hy2UpMbps: optionalNonNegative,
  hy2DownMbps: optionalNonNegative,
  hy2IgnoreClientBandwidth: z.boolean(),
  hy2ObfsPassword: z.string(),
  tuicCongestionControl: z.string(),
  tuicZeroRtt: z.boolean(),
  tuicHeartbeat: z.string(),
  ssMethod: z.string(),
  ssPassword: z.string(),
  ssMode: z.enum(['shared', 'multi-user']),
  naiveNetwork: z.enum(['tcp', 'udp']),
  stVersion: z.enum(['2', '3']),
  stHandshakeDest: z.string(),
  stPassword: z.string(),
  stStrictMode: z.boolean(),
  localAllowLan: z.boolean(),
  localUsersEnabled: z.boolean(),
  directOverrideAddress: z.string(),
  directOverridePort: optionalPort,

  endpointOverrideEnabled: z.boolean(),
  serverHost: z.string(),
  serverPort: optionalPort,
  serverName: z.string(),
  host: z.string(),
  trafficRate: z.coerce.number().min(0.01),
  tags: z.string(),
  level: z.coerce.number().int().min(0),
  sortOrder: z.coerce.number().int().min(0),
  isPublic: z.boolean(),
  status: z.enum(['ACTIVE', 'DISABLED'])
}).superRefine((value, ctx) => {
  if (!value.entryNodeId) ctx.addIssue({ code: 'custom', path: ['entryNodeId'], message: '请选择入口节点' });
  if (value.type === 'RELAY' && !value.exitNodeId) {
    ctx.addIssue({ code: 'custom', path: ['exitNodeId'], message: '中继线路必须选择出口节点' });
  }
  if (value.type === 'RELAY' && !value.relayMode) {
    ctx.addIssue({ code: 'custom', path: ['relayMode'], message: '请选择中继机制' });
  }

  const tlsRequired = ['TROJAN', 'HYSTERIA2', 'TUIC', 'NAIVE'].includes(value.protocolType);
  if (tlsRequired && value.tlsMode === 'none') {
    ctx.addIssue({ code: 'custom', path: ['tlsMode'], message: '该协议必须启用 TLS' });
  }
  if (value.tlsMode === 'tls') {
    if (!value.tlsCertPath.trim()) ctx.addIssue({ code: 'custom', path: ['tlsCertPath'], message: '请输入证书路径' });
    if (!value.tlsKeyPath.trim()) ctx.addIssue({ code: 'custom', path: ['tlsKeyPath'], message: '请输入私钥路径' });
  }
  if (value.tlsMode === 'acme') {
    if (!value.acmeDomain.trim()) ctx.addIssue({ code: 'custom', path: ['acmeDomain'], message: '请输入 ACME 域名' });
    if (!value.acmeEmail.trim()) ctx.addIssue({ code: 'custom', path: ['acmeEmail'], message: '请输入 ACME 邮箱' });
  }
  if (value.protocolType === 'SHADOWTLS' && !value.stHandshakeDest.trim()) {
    ctx.addIssue({ code: 'custom', path: ['stHandshakeDest'], message: '请输入 ShadowTLS 握手目标' });
  }
});

export type LineFormValues = z.infer<typeof lineFormSchema>;

export const splitList = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback?: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function headersToRows(value: unknown) {
  const headers = asRecord(value);
  return Object.entries(headers).map(([key, headerValue]) => ({ key, value: asString(headerValue) }));
}

function rowsToHeaders(rows: Array<{ key: string; value: string }>) {
  const headers: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key) headers[key] = row.value;
  }
  return headers;
}

function protocolTlsMode(protocolType: ProtocolType): LineFormValues['tlsMode'] {
  if (protocolType === 'VLESS') return 'reality';
  if (['TROJAN', 'HYSTERIA2', 'TUIC', 'NAIVE'].includes(protocolType)) return 'tls';
  return 'none';
}

export function defaultLineFormValues(protocolType: ProtocolType = 'VLESS'): LineFormValues {
  const tlsMode = protocolTlsMode(protocolType);
  const isQuic = protocolType === 'HYSTERIA2' || protocolType === 'TUIC';
  return {
    name: '', tag: '', listen: '0.0.0.0', type: 'DIRECT', protocolType, relayMode: 'BLIND_FORWARD',
    entryNodeId: '', entryPort: undefined, exitNodeId: '', exitPort: undefined,
    transportType: 'tcp', wsPath: '/ws', wsHost: '', wsHeaders: [], wsMaxEarlyData: undefined,
    wsEarlyDataHeaderName: '', grpcServiceName: 'grpc', httpPath: '/http', httpHost: '', httpHeaders: [],
    tlsMode, tlsServerName: '', tlsCertPath: '', tlsKeyPath: '', tlsAlpn: isQuic ? 'h3' : 'h2,http/1.1',
    tlsInsecure: false, realityDest: 'www.apple.com:443', realityPrivateKey: '', realityPublicKey: '',
    realityShortIds: '0123456789abcdef', realityServerNames: 'www.apple.com', acmeDomain: '', acmeEmail: '', acmeProvider: '',
    vlessFlow: 'xtls-rprx-vision', vmessAlterId: 0, hy2UpMbps: 0, hy2DownMbps: 0,
    hy2IgnoreClientBandwidth: false, hy2ObfsPassword: '', tuicCongestionControl: 'bbr', tuicZeroRtt: false,
    tuicHeartbeat: '', ssMethod: '2022-blake3-aes-128-gcm', ssPassword: '', ssMode: 'shared', naiveNetwork: 'tcp',
    stVersion: '3', stHandshakeDest: 'gateway.icloud.com:443', stPassword: '', stStrictMode: true,
    localAllowLan: false, localUsersEnabled: false, directOverrideAddress: '', directOverridePort: undefined,
    endpointOverrideEnabled: false, serverHost: '', serverPort: undefined, serverName: '', host: '',
    trafficRate: 1, tags: '', level: 0, sortOrder: 0, isPublic: true, status: 'ACTIVE'
  };
}

function randomPort() {
  return Math.floor(Math.random() * 10000) + 20000;
}

function randomTag() {
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(16).slice(2, 10).padEnd(8, '0');
  return `line-${suffix}`;
}

export function newLineFormValues(protocolType: ProtocolType = 'VLESS'): LineFormValues {
  const port = randomPort();
  return {
    ...defaultLineFormValues(protocolType),
    tag: randomTag(),
    entryPort: port,
    exitPort: port
  };
}

export function lineToFormValues(line: ApiLine): LineFormValues {
  const defaults = defaultLineFormValues(line.protocolType);
  const params = asRecord(line.params) as InboundParams;
  const rawTransport = asRecord(params.transport);
  const rawTls = asRecord(params.tls);
  const rawReality = asRecord(rawTls.reality);
  const rawAcme = asRecord(rawTls.acme);
  const transportType = asString(rawTransport.type, defaults.transportType) as LineFormValues['transportType'];
  const tlsMode = asString(rawTls.mode, defaults.tlsMode) as LineFormValues['tlsMode'];
  const transportHeaders = rawTransport.headers;

  return {
    ...defaults,
    name: line.name,
    tag: line.tag ?? '',
    listen: line.listen,
    type: line.type,
    protocolType: line.protocolType,
    relayMode: line.relayMode ?? 'BLIND_FORWARD',
    entryNodeId: line.entryNodeId,
    entryPort: line.entryPort,
    exitNodeId: line.exitNodeId,
    exitPort: line.exitPort,
    transportType,
    wsPath: asString(rawTransport.path, defaults.wsPath),
    wsHost: asString(rawTransport.host),
    wsHeaders: transportType === 'ws' ? headersToRows(transportHeaders) : [],
    wsMaxEarlyData: asNumber(rawTransport.maxEarlyData),
    wsEarlyDataHeaderName: asString(rawTransport.earlyDataHeaderName),
    grpcServiceName: asString(rawTransport.serviceName, defaults.grpcServiceName),
    httpPath: asString(rawTransport.path, defaults.httpPath),
    httpHost: asString(rawTransport.host),
    httpHeaders: ['http', 'httpupgrade'].includes(transportType) ? headersToRows(transportHeaders) : [],
    tlsMode,
    tlsServerName: asString(rawTls.serverName),
    tlsCertPath: asString(rawTls.certificatePath),
    tlsKeyPath: asString(rawTls.keyPath),
    tlsAlpn: Array.isArray(rawTls.alpn) ? rawTls.alpn.filter((item): item is string => typeof item === 'string').join(',') : '',
    tlsInsecure: rawTls.insecure === true,
    realityDest: asString(rawReality.dest, defaults.realityDest),
    realityPrivateKey: '',
    realityPublicKey: asString(rawReality.publicKey),
    realityShortIds: Array.isArray(rawReality.shortIds) ? rawReality.shortIds.filter((item): item is string => typeof item === 'string').join(',') : '',
    realityServerNames: Array.isArray(rawReality.serverNames) ? rawReality.serverNames.filter((item): item is string => typeof item === 'string').join(',') : '',
    acmeDomain: asString(rawAcme.domain),
    acmeEmail: asString(rawAcme.email),
    acmeProvider: asString(rawAcme.provider),
    vlessFlow: asString(params.flow),
    vmessAlterId: asNumber(params.alterId, 0),
    hy2UpMbps: asNumber(params.upMbps, 0),
    hy2DownMbps: asNumber(params.downMbps, 0),
    hy2IgnoreClientBandwidth: params.ignoreClientBandwidth === true,
    hy2ObfsPassword: asString(asRecord(params.obfs).password),
    tuicCongestionControl: asString(params.congestionControl, 'bbr'),
    tuicZeroRtt: params.zeroRttHandshake === true,
    tuicHeartbeat: asString(params.heartbeat),
    ssMethod: asString(params.method, defaults.ssMethod),
    ssPassword: asString(params.password),
    ssMode: params.mode === 'multi-user' ? 'multi-user' : 'shared',
    naiveNetwork: params.network === 'udp' ? 'udp' : 'tcp',
    stVersion: params.version === 2 ? '2' : '3',
    stHandshakeDest: asString(params.handshakeDest, defaults.stHandshakeDest),
    stPassword: asString(params.password),
    stStrictMode: params.strictMode !== false,
    localAllowLan: params.allowLan === true,
    localUsersEnabled: params.usersEnabled === true,
    directOverrideAddress: asString(params.overrideAddress),
    directOverridePort: asNumber(params.overridePort),
    endpointOverrideEnabled: line.endpointOverrideEnabled,
    serverHost: line.endpointOverrides.serverHost ?? '',
    serverPort: line.endpointOverrides.serverPort ?? undefined,
    serverName: line.endpointOverrides.serverName ?? '',
    host: line.endpointOverrides.host ?? '',
    trafficRate: line.trafficRate,
    tags: line.tags.join(', '),
    level: line.level,
    sortOrder: line.sortOrder,
    isPublic: line.isPublic,
    status: line.status
  };
}

export function buildParamsFromValues(values: LineFormValues): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const transportHeaders = values.transportType === 'ws' ? rowsToHeaders(values.wsHeaders) : rowsToHeaders(values.httpHeaders);

  if (['VLESS', 'VMESS', 'TROJAN'].includes(values.protocolType)) {
    params.transport = {
      type: values.transportType,
      ...(values.transportType === 'ws' || values.transportType === 'httpupgrade' ? {
        path: (values.transportType === 'ws' ? values.wsPath : values.httpPath).trim() || '/',
        host: (values.transportType === 'ws' ? values.wsHost : values.httpHost).trim() || undefined,
        headers: Object.keys(transportHeaders).length ? transportHeaders : undefined,
        ...(values.transportType === 'ws' ? {
          maxEarlyData: values.wsMaxEarlyData,
          earlyDataHeaderName: values.wsEarlyDataHeaderName.trim() || undefined
        } : {})
      } : {}),
      ...(values.transportType === 'grpc' ? { serviceName: values.grpcServiceName.trim() || undefined } : {}),
      ...(values.transportType === 'http' ? {
        path: values.httpPath.trim() || '/',
        host: values.httpHost.trim() || undefined,
        headers: Object.keys(transportHeaders).length ? transportHeaders : undefined
      } : {})
    };
  }

  if (['VLESS', 'VMESS', 'TROJAN', 'HYSTERIA2', 'TUIC', 'NAIVE'].includes(values.protocolType)) {
    const tls: Record<string, unknown> = {
      enabled: values.tlsMode !== 'none',
      mode: values.tlsMode,
      serverName: values.tlsServerName.trim() || undefined,
      alpn: splitList(values.tlsAlpn),
      insecure: values.tlsInsecure
    };
    if (values.tlsMode === 'tls') {
      tls.certificatePath = values.tlsCertPath.trim();
      tls.keyPath = values.tlsKeyPath.trim();
    }
    if (values.tlsMode === 'reality') {
      const reality: Record<string, unknown> = {
        dest: values.realityDest.trim() || 'www.apple.com:443',
        serverNames: splitList(values.realityServerNames),
        shortIds: splitList(values.realityShortIds)
      };
      if (values.realityPrivateKey.trim()) reality.privateKey = values.realityPrivateKey.trim();
      if (values.realityPublicKey.trim()) reality.publicKey = values.realityPublicKey.trim();
      tls.reality = reality;
    }
    if (values.tlsMode === 'acme') {
      tls.acme = {
        domain: values.acmeDomain.trim(),
        email: values.acmeEmail.trim(),
        provider: values.acmeProvider.trim() || undefined
      };
    }
    params.tls = tls;
  }

  switch (values.protocolType) {
    case 'VLESS':
      if (values.vlessFlow.trim()) params.flow = values.vlessFlow.trim();
      break;
    case 'VMESS':
      params.alterId = values.vmessAlterId ?? 0;
      break;
    case 'HYSTERIA2':
      params.upMbps = values.hy2UpMbps ?? 0;
      params.downMbps = values.hy2DownMbps ?? 0;
      params.ignoreClientBandwidth = values.hy2IgnoreClientBandwidth;
      if (values.hy2ObfsPassword.trim()) params.obfs = { type: 'salamander', password: values.hy2ObfsPassword.trim() };
      break;
    case 'TUIC':
      params.congestionControl = values.tuicCongestionControl.trim() || 'bbr';
      params.zeroRttHandshake = values.tuicZeroRtt;
      if (values.tuicHeartbeat.trim()) params.heartbeat = values.tuicHeartbeat.trim();
      break;
    case 'SHADOWSOCKS':
      params.method = values.ssMethod.trim() || '2022-blake3-aes-128-gcm';
      if (values.ssPassword.trim()) params.password = values.ssPassword.trim();
      params.mode = values.ssMode;
      break;
    case 'NAIVE':
      params.network = values.naiveNetwork;
      break;
    case 'SHADOWTLS':
      params.version = Number(values.stVersion);
      params.handshakeDest = values.stHandshakeDest.trim();
      if (values.stPassword.trim()) params.password = values.stPassword.trim();
      params.strictMode = values.stStrictMode;
      break;
    case 'MIXED':
    case 'SOCKS':
    case 'HTTP':
      params.allowLan = values.localAllowLan;
      params.usersEnabled = values.localUsersEnabled;
      break;
    case 'DIRECT':
      if (values.directOverrideAddress.trim()) params.overrideAddress = values.directOverrideAddress.trim();
      if (values.directOverridePort) params.overridePort = values.directOverridePort;
      break;
  }

  return params;
}

export function toLinePayload(values: LineFormValues) {
  const entryNodeId = values.entryNodeId || values.exitNodeId || '';
  const exitNodeId = values.type === 'DIRECT' ? entryNodeId : values.exitNodeId || '';
  return {
    name: values.name.trim(),
    tag: values.tag.trim() || null,
    listen: values.listen.trim(),
    type: values.type,
    protocolType: values.protocolType as NodeProtocolType,
    params: buildParamsFromValues(values),
    relayMode: values.type === 'RELAY' ? values.relayMode : null,
    entryNodeId,
    entryPort: values.entryPort,
    exitNodeId,
    exitPort: values.type === 'DIRECT' ? values.entryPort : values.exitPort,
    endpointOverrideEnabled: values.endpointOverrideEnabled,
    serverHost: values.serverHost.trim() || null,
    serverPort: values.serverPort ?? null,
    serverName: values.serverName.trim() || null,
    host: values.host.trim() || null,
    trafficRate: values.trafficRate,
    tags: splitList(values.tags),
    level: values.level,
    sortOrder: values.sortOrder,
    isPublic: values.isPublic,
    status: values.status
  };
}
