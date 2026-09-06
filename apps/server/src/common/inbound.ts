import { BadRequestException } from '@nestjs/common';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import {
  INTERNAL_RELAY_TRANSIT_EMAIL,
  INTERNAL_RELAY_TRANSIT_UUID,
  ProtocolType,
  TRAFFIC_CREDENTIAL_DELIMITER
} from './constants';
import { decryptSecret, encryptSecret, isEncryptedSecret } from './secret-crypto';

export { TRAFFIC_CREDENTIAL_DELIMITER };

// 格式化入站用户名：若提供 lineId 且非系统内部中继凭证，则注入复合标识以供 Sing-box 区分线路
export function formatInboundUserName(
  user: { email?: string; uuid?: string },
  lineId?: string
): string {
  const baseName = user.email || user.uuid || '';
  if (!lineId || !baseName) return baseName;
  if (baseName === INTERNAL_RELAY_TRANSIT_EMAIL || baseName === INTERNAL_RELAY_TRANSIT_UUID) {
    return baseName;
  }
  return `${baseName}${TRAFFIC_CREDENTIAL_DELIMITER}${lineId}`;
}

// 解析 Agent 上报的凭证快照，分离原始用户凭证与线路 ID（若存在）
export function parseTrafficCredential(credential: string): {
  rawCredential: string;
  lineId: string | null;
} {
  const delimiterIndex = credential.indexOf(TRAFFIC_CREDENTIAL_DELIMITER);
  if (delimiterIndex <= 0) {
    return { rawCredential: credential, lineId: null };
  }
  const rawCredential = credential.slice(0, delimiterIndex);
  const lineId = credential.slice(delimiterIndex + TRAFFIC_CREDENTIAL_DELIMITER.length);
  return {
    rawCredential,
    lineId: lineId.length > 0 ? lineId : null
  };
}

// ==============================
// 传输层 (Transport) 参数定义
// ==============================

export type TransportType = 'tcp' | 'ws' | 'grpc' | 'http' | 'httpupgrade';

export interface InboundTransport {
  type: TransportType;
  path?: string;
  host?: string;
  serviceName?: string;
  headers?: Record<string, string>;
  maxEarlyData?: number;
  earlyDataHeaderName?: string;
}

// ==============================
// 安全层 (TLS/Reality/ACME) 参数定义
// ==============================

export type TlsMode = 'none' | 'tls' | 'reality' | 'acme';

const DEFAULT_TLS_ALPN = ['h2', 'http/1.1'];

function defaultTlsAlpn(transport: TransportType): string[] {
  if (transport === 'grpc') return ['h2'];
  if (transport === 'ws' || transport === 'httpupgrade') return ['http/1.1'];
  return [...DEFAULT_TLS_ALPN];
}

export interface InboundRealityConfig {
  dest: string; // 形如 "www.apple.com:443"
  serverNames: string[];
  privateKey: string;
  publicKey: string;
  shortIds: string[];
}

export interface InboundAcmeConfig {
  domain: string;
  email: string;
  provider?: string;
}

export interface InboundTlsConfig {
  enabled: boolean;
  mode: TlsMode;
  serverName?: string;
  certificatePath?: string;
  keyPath?: string;
  certificate?: string[];
  key?: string[];
  acme?: InboundAcmeConfig;
  reality?: InboundRealityConfig;
  alpn?: string[];
  insecure?: boolean; // 客户端 skip-cert-verify
}

// ==============================
// 协议专属参数定义
// ==============================

export interface VlessParams {
  flow?: string;
  transport?: InboundTransport;
  tls?: InboundTlsConfig;
}

export interface VmessParams {
  alterId?: number;
  transport?: InboundTransport;
  tls?: InboundTlsConfig;
}

export interface TrojanParams {
  transport?: InboundTransport;
  tls?: InboundTlsConfig;
}

export interface Hysteria2Params {
  upMbps?: number;
  downMbps?: number;
  obfs?: {
    type: string;
    password?: string;
  };
  ignoreClientBandwidth?: boolean;
  tls?: InboundTlsConfig;
}

export interface TuicParams {
  congestionControl?: string;
  zeroRttHandshake?: boolean;
  heartbeat?: string;
  tls?: InboundTlsConfig;
}

export interface ShadowsocksParams {
  method: string;
  password?: string;
  mode?: 'shared' | 'multi-user';
}

export interface NaiveParams {
  network?: string;
  tls?: InboundTlsConfig;
}

export interface ShadowtlsParams {
  version: 3;
  handshakeDest: string;
  strictMode: boolean;
  inner: {
    type: 'SHADOWSOCKS';
    method: string;
    password: string;
  };
}

export interface MixedParams {
  allowLan?: boolean;
  usersEnabled?: boolean;
}

export interface SocksParams {
  allowLan?: boolean;
  usersEnabled?: boolean;
}

export interface HttpParams {
  allowLan?: boolean;
  usersEnabled?: boolean;
}

export interface DirectParams {
  overrideAddress?: string;
  overridePort?: number;
}

// 各协议创建入站时的默认 tag 前缀
export const INBOUND_DEFAULT_TAGS: Record<ProtocolType, string> = {
  VLESS: 'vless-in',
  VMESS: 'vmess-in',
  TROJAN: 'trojan-in',
  HYSTERIA2: 'hy2-in',
  TUIC: 'tuic-in',
  SHADOWSOCKS: 'ss-in',
  NAIVE: 'naive-in',
  SHADOWTLS: 'shadowtls-in',
  MIXED: 'mixed-in',
  SOCKS: 'socks-in',
  HTTP: 'http-in',
  DIRECT: 'direct-in'
};

// 仅在 UDP 端口监听的入站类型（可与 TCP 协议在同一端口共存）
export const UDP_INBOUND_TYPES: readonly ProtocolType[] = ['HYSTERIA2', 'TUIC'];

// Reality 创建入站时的默认值
export const REALITY_DEFAULTS = {
  serverNames: ['www.apple.com'],
  dest: 'www.apple.com:443',
  shortIds: ['0123456789abcdef'],
  flow: 'xtls-rprx-vision'
};

export const SS_DEFAULT_METHOD = '2022-blake3-aes-128-gcm';

const SS2022_KEY_LENGTHS: Record<string, number> = {
  '2022-blake3-aes-128-gcm': 16,
  '2022-blake3-aes-256-gcm': 32,
  '2022-blake3-chacha20-poly1305': 32
};

// 参与流量/资格注入的用户凭证
export interface InboundUserCredential {
  uuid: string;
  email: string;
  credential: string;
}

function shadowsocks2022KeyLength(method: string): number | undefined {
  return SS2022_KEY_LENGTHS[method.trim().toLowerCase()];
}

function isValidShadowsocks2022Key(value: string, keyLength: number): boolean {
  const candidate = value.trim();
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(candidate)) {
    return false;
  }
  try {
    const decoded = Buffer.from(candidate, 'base64');
    return decoded.length === keyLength && decoded.toString('base64') === candidate;
  } catch {
    return false;
  }
}

function deriveShadowsocks2022Key(method: string, identity: string): string {
  const keyLength = shadowsocks2022KeyLength(method);
  if (!keyLength) return identity;
  return createHash('sha256')
    .update(`riricloud:ss2022:${method.trim().toLowerCase()}:${identity}`)
    .digest()
    .subarray(0, keyLength)
    .toString('base64');
}

// SS 2022 要求用户密钥为固定长度的 Base64 原始密钥；普通用户密码或 UUID 不能直接使用。
export function normalizeShadowsocksPassword(method: string, password: string): string {
  const keyLength = shadowsocks2022KeyLength(method);
  const candidate = password.trim();
  if (!keyLength || isValidShadowsocks2022Key(candidate, keyLength)) return candidate;
  return deriveShadowsocks2022Key(method, `shared:${candidate}`);
}

export function resolveShadowsocksUserPassword(method: string, credential: string, userUuid: string): string {
  const keyLength = shadowsocks2022KeyLength(method);
  const candidate = credential.trim();
  if (!keyLength || isValidShadowsocks2022Key(candidate, keyLength)) return candidate;
  return deriveShadowsocks2022Key(method, `user:${userUuid || candidate}`);
}

// SS2022 客户端凭证由服务端主密钥和用户密钥组成；普通 SS 仍使用用户密码本身。
export function buildShadowsocksClientPassword(
  method: string,
  serverPassword: string,
  credential: string,
  userUuid: string
): string {
  const userPassword = resolveShadowsocksUserPassword(method, credential, userUuid);
  if (!shadowsocks2022KeyLength(method)) return userPassword;
  return `${normalizeShadowsocksPassword(method, serverPassword)}:${userPassword}`;
}

// X25519 Reality 密钥对生成（32 字节裸密钥 base64url）
export function generateRealityKeypair(): { privateKey: string; publicKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync('x25519');
  const pubDer = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
  const privDer = privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer;
  const b64 = (der: Buffer) => der.subarray(der.length - 32).toString('base64url');
  return { privateKey: b64(privDer), publicKey: b64(pubDer) };
}

// 解析 "host:port" 形式的目标地址
export function parseDest(dest: string): { host: string; port: number } {
  const idx = dest.lastIndexOf(':');
  if (idx <= 0) {
    throw new BadRequestException('dest 须为 host:port 形式（如 www.apple.com:443）');
  }
  const host = dest.slice(0, idx).trim();
  const port = Number(dest.slice(idx + 1));
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new BadRequestException('dest 须为 host:port 形式（如 www.apple.com:443）');
  }
  return { host, port };
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value) && value.every((v) => typeof v === 'string' && v.length > 0)) {
    return value as string[];
  }
  return fallback;
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
    return [...new Set(value.map((v) => (v as string).trim()).filter(Boolean))];
  }
  return fallback;
}

function asNonEmptyString(value: unknown, field: string): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  throw new BadRequestException(`${field} 不能为空`);
}

function asPositiveNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function normalizeTransport(raw: unknown): InboundTransport {
  const t = (raw ?? {}) as Record<string, unknown>;
  const type = (typeof t.type === 'string' ? t.type.toLowerCase() : 'tcp') as TransportType;
  if (!['tcp', 'ws', 'grpc', 'http', 'httpupgrade'].includes(type)) {
    throw new BadRequestException(`不支持的传输层类型: ${type as string}`);
  }
  const res: InboundTransport = { type };
  if (t.path && typeof t.path === 'string') res.path = t.path.trim();
  if (t.host && typeof t.host === 'string') res.host = t.host.trim();
  if (t.serviceName && typeof t.serviceName === 'string') res.serviceName = t.serviceName.trim();
  if (t.headers && typeof t.headers === 'object' && !Array.isArray(t.headers)) {
    res.headers = t.headers as Record<string, string>;
  }
  if (t.maxEarlyData != null) res.maxEarlyData = Number(t.maxEarlyData);
  if (t.earlyDataHeaderName && typeof t.earlyDataHeaderName === 'string') {
    res.earlyDataHeaderName = t.earlyDataHeaderName.trim();
  }
  return res;
}

function normalizeTlsConfig(raw: unknown, defaultMode: TlsMode = 'none', defaultAlpn: string[] = DEFAULT_TLS_ALPN): InboundTlsConfig {
  const tls = (raw ?? {}) as Record<string, unknown>;
  const enabled = tls.enabled !== false && tls.mode !== 'none';
  const mode = (typeof tls.mode === 'string' ? tls.mode.toLowerCase() : defaultMode) as TlsMode;

  if (!enabled || mode === 'none') {
    return { enabled: false, mode: 'none' };
  }

  const alpn = normalizeStringArray(tls.alpn, defaultAlpn);
  const insecure = tls.insecure === true;
  const serverName = typeof tls.serverName === 'string' ? tls.serverName.trim() : undefined;
  const certificate = Array.isArray(tls.certificate) ? asStringArray(tls.certificate, []) : undefined;
  const key = Array.isArray(tls.key) ? asStringArray(tls.key, []) : undefined;
  if ((certificate?.length ?? 0) !== 0 || (key?.length ?? 0) !== 0) {
    if (!certificate?.length || !key?.length) {
      throw new BadRequestException('内嵌 TLS 证书与私钥必须成对提供');
    }
  }

  if (mode === 'reality') {
    const rawReality = (tls.reality ?? {}) as Record<string, unknown>;
    const hasPriv = typeof rawReality.privateKey === 'string' && rawReality.privateKey.length > 0;
    const hasPub = typeof rawReality.publicKey === 'string' && rawReality.publicKey.length > 0;
    if (hasPriv !== hasPub) {
      throw new BadRequestException('Reality 密钥对必须成对提供（可由系统生成）');
    }
    const keys = hasPriv
      ? { privateKey: rawReality.privateKey as string, publicKey: rawReality.publicKey as string }
      : generateRealityKeypair();

    const dest =
      typeof rawReality.dest === 'string' && rawReality.dest.trim()
        ? rawReality.dest.trim()
        : REALITY_DEFAULTS.dest;
    parseDest(dest);

    const reality: InboundRealityConfig = {
      dest,
      serverNames: asStringArray(rawReality.serverNames ?? (serverName ? [serverName] : undefined), [
        ...REALITY_DEFAULTS.serverNames
      ]),
      shortIds: asStringArray(rawReality.shortIds, [...REALITY_DEFAULTS.shortIds]),
      ...keys
    };

    return {
      enabled: true,
      mode: 'reality',
      serverName: reality.serverNames[0],
      reality,
      insecure
    };
  }

  if (mode === 'acme') {
    const rawAcme = (tls.acme ?? {}) as Record<string, unknown>;
    const domain = asNonEmptyString(rawAcme.domain ?? serverName, 'ACME 域名 (acme.domain)');
    const email = asNonEmptyString(rawAcme.email, 'ACME 邮箱 (acme.email)');
    return {
      enabled: true,
      mode: 'acme',
      serverName: domain,
      acme: {
        domain,
        email,
        provider: typeof rawAcme.provider === 'string' ? rawAcme.provider.trim() : undefined
      },
      alpn,
      insecure
    };
  }

  // 标准 TLS
  return {
    enabled: true,
    mode: 'tls',
    serverName: serverName ? serverName : undefined,
    ...(certificate?.length && key?.length
      ? { certificate, key }
      : {
          certificatePath: asNonEmptyString(tls.certificatePath, 'tls.certificatePath（Agent 本地路径）'),
          keyPath: asNonEmptyString(tls.keyPath, 'tls.keyPath（Agent 本地路径）')
        }),
    alpn,
    insecure
  };
}

// 按协议归一化 paramsJson：填充默认值、生成缺失密钥、校验必填项
export function normalizeInboundParams(
  type: ProtocolType,
  raw: Record<string, unknown>
): Record<string, unknown> {
  switch (type) {
    case 'VLESS':
    case 'VLESS_REALITY' as ProtocolType: {
      const transport = raw.transport ? normalizeTransport(raw.transport) : { type: 'tcp' as const };
      // 兼容旧版扁平 Reality 参数（dest / serverNames / privateKey / publicKey / shortIds）
      let rawTls = raw.tls;
      if (!rawTls && (raw.dest || raw.serverNames || raw.publicKey || raw.privateKey || raw.shortIds)) {
        rawTls = {
          enabled: true,
          mode: 'reality',
          reality: {
            dest: raw.dest,
            serverNames: raw.serverNames,
            privateKey: raw.privateKey,
            publicKey: raw.publicKey,
            shortIds: raw.shortIds
          }
        };
      }
      const tls = normalizeTlsConfig(rawTls, rawTls ? 'tls' : 'reality', defaultTlsAlpn(transport.type));
      // Vision flow 依赖 TLS/Reality；明文 VLESS 必须省略 flow。
      const requestedFlow = typeof raw.flow === 'string' && raw.flow.trim() ? raw.flow.trim() : undefined;
      const flow =
        tls.mode === 'none'
          ? undefined
          : requestedFlow || (tls.mode === 'reality' ? REALITY_DEFAULTS.flow : undefined);

      const params: VlessParams = {
        flow,
        transport,
        tls
      };
      return params as unknown as Record<string, unknown>;
    }

    case 'VMESS': {
      const transport = raw.transport ? normalizeTransport(raw.transport) : { type: 'tcp' as const };
      const tls = normalizeTlsConfig(raw.tls, 'none', defaultTlsAlpn(transport.type));
      const alterId = Number(raw.alterId) || 0;
      const params: VmessParams = { alterId, transport, tls };
      return params as unknown as Record<string, unknown>;
    }

    case 'TROJAN': {
      const transport = raw.transport ? normalizeTransport(raw.transport) : { type: 'tcp' as const };
      const tls = normalizeTlsConfig(raw.tls, 'tls', defaultTlsAlpn(transport.type));
      if (!tls.enabled || tls.mode === 'none') {
        throw new BadRequestException('Trojan 协议必须启用 TLS 安全层');
      }
      const params: TrojanParams = { transport, tls };
      return params as unknown as Record<string, unknown>;
    }

    case 'HYSTERIA2': {
      const tls = normalizeTlsConfig(raw.tls, 'tls', ['h3']);
      if (!tls.enabled || tls.mode === 'none') {
        throw new BadRequestException('Hysteria 2 协议必须配置 TLS 安全层');
      }
      let obfs: { type: string; password?: string } | undefined;
      if (raw.obfs && typeof raw.obfs === 'object') {
        const o = raw.obfs as Record<string, unknown>;
        if (typeof o.password === 'string' && o.password.trim()) {
          obfs = { type: typeof o.type === 'string' ? o.type.trim() : 'salamander', password: o.password.trim() };
        }
      }
      const params: Hysteria2Params = {
        upMbps: asPositiveNumber(raw.upMbps, 0),
        downMbps: asPositiveNumber(raw.downMbps, 0),
        ignoreClientBandwidth: raw.ignoreClientBandwidth === true,
        obfs,
        tls
      };
      return params as unknown as Record<string, unknown>;
    }

    case 'TUIC': {
      const tls = normalizeTlsConfig(raw.tls, 'tls', ['h3']);
      if (!tls.enabled || tls.mode === 'none') {
        throw new BadRequestException('TUIC 协议必须配置 TLS 安全层');
      }
      const params: TuicParams = {
        congestionControl:
          typeof raw.congestionControl === 'string' && raw.congestionControl.trim()
            ? raw.congestionControl.trim()
            : 'bbr',
        zeroRttHandshake: raw.zeroRttHandshake === true,
        heartbeat: typeof raw.heartbeat === 'string' ? raw.heartbeat.trim() : undefined,
        tls
      };
      return params as unknown as Record<string, unknown>;
    }

    case 'SHADOWSOCKS': {
      const method =
        typeof raw.method === 'string' && raw.method.trim() ? raw.method.trim() : SS_DEFAULT_METHOD;
      let password = typeof raw.password === 'string' && raw.password ? raw.password : '';
      if (!password) {
        const keyBytes =
          method === '2022-blake3-aes-256-gcm' || method === '2022-blake3-chacha20-poly1305'
            ? 32
            : 16;
        password = randomBytes(keyBytes).toString('base64');
      } else {
        password = normalizeShadowsocksPassword(method, password);
      }
      const mode = raw.mode === 'multi-user' ? 'multi-user' : 'shared';
      const params: ShadowsocksParams = { method, password, mode };
      return params as unknown as Record<string, unknown>;
    }

    case 'NAIVE': {
      const tls = normalizeTlsConfig(raw.tls, 'tls', ['h2']);
      if (!tls.enabled || tls.mode === 'none') {
        throw new BadRequestException('NaiveProxy 协议必须启用 TLS 安全层');
      }
      const params: NaiveParams = {
        network: typeof raw.network === 'string' ? raw.network.trim() : 'tcp',
        tls
      };
      return params as unknown as Record<string, unknown>;
    }

    case 'SHADOWTLS': {
      if (Number(raw.version) !== 3) {
        throw new BadRequestException('ShadowTLS 仅支持 v3');
      }
      const handshakeDest = asNonEmptyString(raw.handshakeDest, 'ShadowTLS 握手目标 (handshakeDest)');
      parseDest(handshakeDest);
      const rawInner = raw.inner;
      if (!rawInner || typeof rawInner !== 'object' || Array.isArray(rawInner)) {
        throw new BadRequestException('ShadowTLS 必须配置内层 Shadowsocks 2022');
      }
      const inner = rawInner as Record<string, unknown>;
      if (inner.type !== 'SHADOWSOCKS') {
        throw new BadRequestException('ShadowTLS 内层协议必须为 SHADOWSOCKS');
      }
      const method = asNonEmptyString(inner.method, 'ShadowTLS 内层 Shadowsocks 算法');
      const keyLength = shadowsocks2022KeyLength(method);
      if (!keyLength) {
        throw new BadRequestException('ShadowTLS 内层必须使用 Shadowsocks 2022 算法');
      }
      const rawPassword = typeof inner.password === 'string' ? inner.password.trim() : '';
      const password = rawPassword
        ? normalizeShadowsocksPassword(method, rawPassword)
        : randomBytes(keyLength).toString('base64');
      const params: ShadowtlsParams = {
        version: 3,
        handshakeDest,
        strictMode: raw.strictMode !== false,
        inner: { type: 'SHADOWSOCKS', method, password }
      };
      return params as unknown as Record<string, unknown>;
    }

    case 'MIXED':
    case 'SOCKS':
    case 'HTTP': {
      return {
        allowLan: raw.allowLan === true,
        usersEnabled: raw.usersEnabled === true
      };
    }

    case 'DIRECT': {
      return {
        overrideAddress: typeof raw.overrideAddress === 'string' ? raw.overrideAddress.trim() : undefined,
        overridePort: raw.overridePort ? Number(raw.overridePort) : undefined
      };
    }

    default:
      throw new BadRequestException(`不支持的入站协议：${type as string}`);
  }
}

// API 输出脱敏：剥离 Reality 私钥等
export function sanitizeInboundParams(params: Record<string, unknown>): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(params)) as Record<string, unknown>;
  // 兼容迁移前的扁平 Reality 参数，避免旧存量配置泄露私钥。
  delete clone.privateKey;
  delete clone.key;
  if (clone.tls && typeof clone.tls === 'object') {
    const tls = clone.tls as Record<string, unknown>;
    delete tls.key;
    if (tls.reality && typeof tls.reality === 'object') {
      const reality = tls.reality as Record<string, unknown>;
      delete reality.privateKey;
    }
  }
  return clone;
}

// Reality 私钥只在 Agent 配置组装时还原，数据库中的线路参数始终保存密文。
export function protectInboundSecrets(params: Record<string, unknown>): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(params)) as Record<string, unknown>;
  const tls = clone.tls;
  if (!tls || typeof tls !== 'object' || Array.isArray(tls)) return clone;
  const reality = (tls as Record<string, unknown>).reality;
  if (!reality || typeof reality !== 'object' || Array.isArray(reality)) return clone;
  const privateKey = (reality as Record<string, unknown>).privateKey;
  if (typeof privateKey === 'string' && privateKey.length > 0 && !isEncryptedSecret(privateKey)) {
    (reality as Record<string, unknown>).privateKey = encryptSecret(privateKey);
  }
  return clone;
}

export function revealInboundSecrets(params: Record<string, unknown>): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(params)) as Record<string, unknown>;
  const tls = clone.tls;
  if (!tls || typeof tls !== 'object' || Array.isArray(tls)) return clone;
  const reality = (tls as Record<string, unknown>).reality;
  if (!reality || typeof reality !== 'object' || Array.isArray(reality)) return clone;
  const privateKey = (reality as Record<string, unknown>).privateKey;
  if (typeof privateKey === 'string' && isEncryptedSecret(privateKey)) {
    (reality as Record<string, unknown>).privateKey = decryptSecret(privateKey);
  }
  return clone;
}

// 组装客户端侧 V2Ray Transport；WebSocket 的 Host 必须落在 headers.Host。
export function buildClientTransport(
  transport?: InboundTransport,
  hostOverride?: string | null
): Record<string, unknown> | undefined {
  if (!transport || transport.type === 'tcp') return undefined;
  const host = hostOverride?.trim() || transport.host;
  const headers = transport.headers ? { ...transport.headers } : {};

  switch (transport.type) {
    case 'ws':
      if (host) headers.Host = host;
      return {
        type: 'ws',
        ...(transport.path ? { path: transport.path } : {}),
        ...(Object.keys(headers).length ? { headers } : {}),
        ...(transport.maxEarlyData && transport.maxEarlyData > 0 ? { max_early_data: transport.maxEarlyData } : {}),
        ...(transport.earlyDataHeaderName ? { early_data_header_name: transport.earlyDataHeaderName } : {})
      };
    case 'grpc':
      return {
        type: 'grpc',
        ...(transport.serviceName ? { service_name: transport.serviceName } : {})
      };
    case 'http':
      return {
        type: 'http',
        ...(host ? { host: [host] } : {}),
        ...(transport.path ? { path: transport.path } : {}),
        ...(Object.keys(headers).length ? { headers } : {})
      };
    case 'httpupgrade':
      return {
        type: 'httpupgrade',
        ...(host ? { host } : {}),
        ...(transport.path ? { path: transport.path } : {}),
        ...(Object.keys(headers).length ? { headers } : {})
      };
    default:
      return undefined;
  }
}

// 组装客户端侧 TLS；Reality 需要同时携带公钥、Short ID 和 uTLS 参数。
export function buildClientTls(
  tls?: InboundTlsConfig,
  serverNameOverride?: string | null,
  options: { includeAlpn?: boolean; includeInsecure?: boolean } = {}
): Record<string, unknown> | undefined {
  if (!tls || !tls.enabled || tls.mode === 'none') return undefined;
  const reality = tls.reality;
  const serverName = serverNameOverride?.trim() || tls.serverName || reality?.serverNames[0];

  if (tls.mode === 'reality' && reality) {
    return {
      enabled: true,
      ...(serverName ? { server_name: serverName } : {}),
      utls: { enabled: true, fingerprint: 'chrome' },
      reality: {
        enabled: true,
        public_key: reality.publicKey,
        short_id: reality.shortIds[0]
      }
    };
  }

  return {
    enabled: true,
    ...(serverName ? { server_name: serverName } : {}),
    ...(options.includeAlpn !== false && tls.alpn?.length ? { alpn: tls.alpn } : {}),
    ...(options.includeInsecure !== false ? { insecure: tls.insecure === true } : {})
  };
}

// 构建 Sing-box Transport 配置块
function buildServerTransport(transport?: InboundTransport): Record<string, unknown> | undefined {
  if (!transport || transport.type === 'tcp') return undefined;

  switch (transport.type) {
    case 'ws': {
      const ws: Record<string, unknown> = { type: 'ws' };
      const headers = transport.headers ? { ...transport.headers } : {};
      // sing-box 的 WebSocket transport 没有顶层 host 字段，统一映射到 Host 请求头。
      if (transport.host) headers.Host = transport.host;
      if (transport.path) ws.path = transport.path;
      if (Object.keys(headers).length) ws.headers = headers;
      if (transport.maxEarlyData) ws.max_early_data = transport.maxEarlyData;
      if (transport.earlyDataHeaderName) ws.early_data_header_name = transport.earlyDataHeaderName;
      return ws;
    }
    case 'grpc': {
      const grpc: Record<string, unknown> = { type: 'grpc' };
      if (transport.serviceName) grpc.service_name = transport.serviceName;
      return grpc;
    }
    case 'http': {
      const http: Record<string, unknown> = { type: 'http' };
      if (transport.host) http.host = [transport.host];
      if (transport.path) http.path = transport.path;
      if (transport.headers) http.headers = transport.headers;
      return http;
    }
    case 'httpupgrade': {
      const hup: Record<string, unknown> = { type: 'httpupgrade' };
      if (transport.host) hup.host = transport.host;
      if (transport.path) hup.path = transport.path;
      if (transport.headers) hup.headers = transport.headers;
      return hup;
    }
    default:
      return undefined;
  }
}

// 构建 Sing-box TLS 配置块
function buildServerTls(tls?: InboundTlsConfig): Record<string, unknown> | undefined {
  if (!tls || !tls.enabled || tls.mode === 'none') return undefined;

  if (tls.mode === 'reality' && tls.reality) {
    const { host, port } = parseDest(tls.reality.dest);
    return {
      enabled: true,
      server_name: tls.serverName || tls.reality.serverNames[0],
      reality: {
        enabled: true,
        handshake: { server: host, server_port: port },
        private_key: tls.reality.privateKey,
        short_id: tls.reality.shortIds
      }
    };
  }

  if (tls.mode === 'acme' && tls.acme) {
    return {
      enabled: true,
      server_name: tls.serverName || tls.acme.domain,
      acme: {
        domain: tls.acme.domain,
        email: tls.acme.email,
        ...(tls.acme.provider ? { provider: tls.acme.provider } : {})
      },
      ...(tls.alpn && tls.alpn.length ? { alpn: tls.alpn } : {})
    };
  }

  if (tls.certificate?.length && tls.key?.length) {
    return {
      enabled: true,
      ...(tls.serverName ? { server_name: tls.serverName } : {}),
      certificate: tls.certificate,
      key: tls.key,
      ...(tls.alpn && tls.alpn.length ? { alpn: tls.alpn } : {})
    };
  }

  // 标准 TLS (证书路径)
  return {
    enabled: true,
    ...(tls.serverName ? { server_name: tls.serverName } : {}),
    certificate_path: tls.certificatePath,
    key_path: tls.keyPath,
    ...(tls.alpn && tls.alpn.length ? { alpn: tls.alpn } : {})
  };
}

// 组装 Sing-box 服务端入站 JSON（用于 Agent 的 config_sync）
export function buildServerInbound(input: {
  type: ProtocolType;
  tag: string;
  listen: string;
  port: number;
  params: Record<string, unknown>;
  users: InboundUserCredential[];
  lineId?: string;
}): Record<string, unknown> {
  const { type, tag, listen, port, params, users, lineId } = input;
  // VLESS 需要在运行时修复旧版明文 + Vision 数据；其余协议已在入站 CRUD 边界完成归一化，
  // 中继组装还可能只携带客户端侧 TLS 参数，不能在这里重复要求 Agent 证书路径。
  const rawVlessTls = params.tls;
  const vlessTlsDisabled =
    rawVlessTls && typeof rawVlessTls === 'object' && !Array.isArray(rawVlessTls)
      ? (rawVlessTls as Record<string, unknown>).enabled === false ||
        (rawVlessTls as Record<string, unknown>).mode === 'none'
      : false;
  const normalizedParams =
    type === 'VLESS' && (!rawVlessTls || vlessTlsDisabled)
      ? normalizeInboundParams(type, params)
      : params;

  switch (type) {
    case 'VLESS':
    case 'VLESS_REALITY' as ProtocolType: {
      const normalized = normalizedParams as unknown as VlessParams;
      const transport = buildServerTransport(normalized.transport);
      const tls = buildServerTls(normalized.tls);
      return {
        type: 'vless',
        tag,
        listen,
        listen_port: port,
        users: users.map((u) => ({
          uuid: u.uuid,
          name: formatInboundUserName(u, lineId),
          ...(normalized.flow ? { flow: normalized.flow } : {})
        })),
        ...(transport ? { transport } : {}),
        ...(tls ? { tls } : {})
      };
    }

    case 'VMESS': {
      const p = normalizedParams as unknown as VmessParams;
      const transport = buildServerTransport(p.transport);
      const tls = buildServerTls(p.tls);
      return {
        type: 'vmess',
        tag,
        listen,
        listen_port: port,
        users: users.map((u) => ({
          uuid: u.uuid,
          name: formatInboundUserName(u, lineId),
          alterId: p.alterId ?? 0
        })),
        ...(transport ? { transport } : {}),
        ...(tls ? { tls } : {})
      };
    }

    case 'TROJAN': {
      const p = normalizedParams as unknown as TrojanParams;
      const transport = buildServerTransport(p.transport);
      const tls = buildServerTls(p.tls);
      return {
        type: 'trojan',
        tag,
        listen,
        listen_port: port,
        users: users.map((u) => ({
          password: u.credential,
          name: formatInboundUserName(u, lineId)
        })),
        ...(transport ? { transport } : {}),
        ...(tls ? { tls } : {})
      };
    }

    case 'HYSTERIA2': {
      const p = normalizedParams as unknown as Hysteria2Params;
      const tls = buildServerTls(p.tls);
      return {
        type: 'hysteria2',
        tag,
        listen,
        listen_port: port,
        ...(p.upMbps && p.upMbps > 0 ? { up_mbps: p.upMbps } : {}),
        ...(p.downMbps && p.downMbps > 0 ? { down_mbps: p.downMbps } : {}),
        ...(p.ignoreClientBandwidth ? { ignore_client_bandwidth: true } : {}),
        ...(p.obfs ? { obfs: p.obfs } : {}),
        users: users.map((u) => ({ name: formatInboundUserName(u, lineId), password: u.credential })),
        ...(tls ? { tls } : {})
      };
    }

    case 'TUIC': {
      const p = normalizedParams as unknown as TuicParams;
      const tls = buildServerTls(p.tls);
      return {
        type: 'tuic',
        tag,
        listen,
        listen_port: port,
        users: users.map((u) => ({ uuid: u.uuid, name: formatInboundUserName(u, lineId), password: u.credential })),
        congestion_control: p.congestionControl || 'bbr',
        ...(p.zeroRttHandshake ? { zero_rtt_handshake: true } : {}),
        ...(p.heartbeat ? { heartbeat: p.heartbeat } : {}),
        ...(tls ? { tls } : {})
      };
    }

    case 'SHADOWSOCKS': {
      const p = normalizedParams as unknown as ShadowsocksParams;
      const password = normalizeShadowsocksPassword(p.method, p.password || '');
      if (p.mode === 'multi-user') {
        return {
          type: 'shadowsocks',
          tag,
          listen,
          listen_port: port,
          method: p.method,
          password,
          users: users.map((u) => ({
            name: formatInboundUserName(u, lineId),
            password: resolveShadowsocksUserPassword(p.method, u.credential, u.uuid)
          }))
        };
      }
      return {
        type: 'shadowsocks',
        tag,
        listen,
        listen_port: port,
        method: p.method,
        password
      };
    }

    case 'NAIVE': {
      const p = normalizedParams as unknown as NaiveParams;
      const tls = buildServerTls(p.tls);
      return {
        type: 'naive',
        tag,
        listen,
        listen_port: port,
        network: p.network || 'tcp',
        users: users.map((u) => ({ username: formatInboundUserName(u, lineId), password: u.credential })),
        ...(tls ? { tls } : {})
      };
    }

    case 'SHADOWTLS': {
      const p = normalizeInboundParams('SHADOWTLS', normalizedParams) as unknown as ShadowtlsParams;
      const { host, port: destPort } = parseDest(p.handshakeDest);
      return {
        type: 'shadowtls',
        tag,
        listen,
        listen_port: port,
        detour: `${tag}-inner`,
        version: 3,
        users: users.map((u) => ({ name: formatInboundUserName(u, lineId), password: u.credential })),
        handshake: { server: host, server_port: destPort },
        strict_mode: p.strictMode !== false
      };
    }

    case 'MIXED':
    case 'SOCKS':
    case 'HTTP': {
      const p = normalizedParams as unknown as MixedParams;
      const inboundObj: Record<string, unknown> = {
        type: type.toLowerCase(),
        tag,
        listen,
        listen_port: port
      };
      if (p.usersEnabled && users.length) {
        inboundObj.users = users.map((u) => ({ username: formatInboundUserName(u, lineId), password: u.credential }));
      }
      return inboundObj;
    }

    case 'DIRECT': {
      const p = normalizedParams as unknown as DirectParams;
      return {
        type: 'direct',
        tag,
        listen,
        listen_port: port,
        ...(p.overrideAddress ? { override_address: p.overrideAddress } : {}),
        ...(p.overridePort ? { override_port: p.overridePort } : {})
      };
    }

    default:
      throw new BadRequestException(`不支持的入站协议：${type as string}`);
  }
}

// ShadowTLS v3 只作为外层伪装，内层 SS 入站仅绑定回环地址并由 detour 注入。
export function buildServerInbounds(input: Parameters<typeof buildServerInbound>[0]): Array<Record<string, unknown>> {
  if (input.type !== 'SHADOWTLS') return [buildServerInbound(input)];
  const params = normalizeInboundParams('SHADOWTLS', input.params) as unknown as ShadowtlsParams;
  const normalizedInput = { ...input, params: params as unknown as Record<string, unknown> };
  const primary = buildServerInbound(normalizedInput);
  return [
    primary,
    {
      type: 'shadowsocks',
      tag: `${input.tag}-inner`,
      listen: '127.0.0.1',
      listen_port: 0,
      method: params.inner.method,
      password: normalizeShadowsocksPassword(params.inner.method, params.inner.password)
    }
  ];
}
