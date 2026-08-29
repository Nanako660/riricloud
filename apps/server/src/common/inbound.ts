import { BadRequestException } from '@nestjs/common';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { ProtocolType } from './constants';

// ==============================
// 入站协议专属参数（paramsJson）类型定义
// 结构与约束的权威文档见 docs/DATA_MODELS.md §3.1
// ==============================

export interface VlessRealityParams {
  serverNames: string[];
  dest: string; // 形如 "www.apple.com:443"
  privateKey: string;
  publicKey: string;
  shortIds: string[];
  flow: string;
}

// HYSTERIA2 / TUIC 服务端 TLS（证书为 Agent 机本地路径）
export interface InboundTlsParams {
  serverName: string;
  certificatePath: string;
  keyPath: string;
  alpn: string[];
  insecure: boolean; // 仅影响订阅客户端输出 skip-cert-verify
}

export interface Hysteria2Params {
  upMbps: number;
  downMbps: number;
  tls: InboundTlsParams;
}

export interface TuicParams {
  congestionControl: string;
  tls: InboundTlsParams;
}

export interface ShadowsocksParams {
  method: string;
  password: string;
}

// 各协议创建入站时的默认 tag 前缀（冲突时自动追加序号）
export const INBOUND_DEFAULT_TAGS: Record<ProtocolType, string> = {
  VLESS_REALITY: 'vless-in',
  HYSTERIA2: 'hy2-in',
  SHADOWSOCKS: 'ss-in',
  TUIC: 'tuic-in'
};

// 同端口冲突判定按传输层分组：UDP 协议（QUIC）可与 TCP 协议共存于同一端口
export const UDP_INBOUND_TYPES: readonly ProtocolType[] = ['HYSTERIA2', 'TUIC'];

// Reality 创建入站时的演示默认值（管理端可改，勿与订阅输出各自硬编码副本）
export const REALITY_DEFAULTS = {
  serverNames: ['www.apple.com'],
  dest: 'www.apple.com:443',
  shortIds: ['0123456789abcdef'],
  flow: 'xtls-rprx-vision'
};

export const SS_DEFAULT_METHOD = '2022-blake3-aes-128-gcm';

// 参与流量/资格注入的用户凭证（hy2/tuic/ss 用 password，缺省回退 uuid）
export interface InboundUserCredential {
  uuid: string;
  email: string;
  credential: string;
}

// X25519 Reality 密钥对：sing-box 要求 32 字节裸密钥的 base64url
// （等价 sing-box generate reality-keypair；PEM/标准 base64 均会被内核拒绝）
export function generateRealityKeypair(): { privateKey: string; publicKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync('x25519');
  const pubDer = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
  const privDer = privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer;
  const b64 = (der: Buffer) => der.subarray(der.length - 32).toString('base64url');
  return { privateKey: b64(privDer), publicKey: b64(pubDer) };
}

// 解析 "host:port" 形式的 Reality 握手目标
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

function normalizeTls(raw: unknown): InboundTlsParams {
  const tls = (raw ?? {}) as Record<string, unknown>;
  return {
    serverName: asNonEmptyString(tls.serverName, 'tls.serverName'),
    certificatePath: asNonEmptyString(tls.certificatePath, 'tls.certificatePath（Agent 机本地路径）'),
    keyPath: asNonEmptyString(tls.keyPath, 'tls.keyPath（Agent 机本地路径）'),
    alpn: asStringArray(tls.alpn, ['h3']),
    insecure: tls.insecure === true
  };
}

// 按协议归一化 paramsJson：填充默认值、自动生成缺失密钥、校验必填项。
// 校验失败抛 BadRequestException；返回可直接落库/组配置的对象。
export function normalizeInboundParams(
  type: ProtocolType,
  raw: Record<string, unknown>
): Record<string, unknown> {
  switch (type) {
    case 'VLESS_REALITY': {
      const hasPriv = typeof raw.privateKey === 'string' && raw.privateKey.length > 0;
      const hasPub = typeof raw.publicKey === 'string' && raw.publicKey.length > 0;
      if (hasPriv !== hasPub) {
        throw new BadRequestException('Reality 密钥对必须成对提供（可由系统生成）');
      }
      const keys = hasPriv
        ? { privateKey: raw.privateKey as string, publicKey: raw.publicKey as string }
        : generateRealityKeypair();
      const params: VlessRealityParams = {
        serverNames: asStringArray(raw.serverNames, [...REALITY_DEFAULTS.serverNames]),
        dest: typeof raw.dest === 'string' && raw.dest.trim() ? raw.dest.trim() : REALITY_DEFAULTS.dest,
        ...keys,
        shortIds: asStringArray(raw.shortIds, [...REALITY_DEFAULTS.shortIds]),
        flow: typeof raw.flow === 'string' && raw.flow.trim() ? raw.flow.trim() : REALITY_DEFAULTS.flow
      };
      parseDest(params.dest); // 提前校验格式
      return params as unknown as Record<string, unknown>;
    }
    case 'HYSTERIA2': {
      const params: Hysteria2Params = {
        upMbps: asPositiveNumber(raw.upMbps, 0),
        downMbps: asPositiveNumber(raw.downMbps, 0),
        tls: normalizeTls(raw.tls)
      };
      return params as unknown as Record<string, unknown>;
    }
    case 'TUIC': {
      const params: TuicParams = {
        congestionControl:
          typeof raw.congestionControl === 'string' && raw.congestionControl.trim()
            ? raw.congestionControl.trim()
            : 'bbr',
        tls: normalizeTls(raw.tls)
      };
      return params as unknown as Record<string, unknown>;
    }
    case 'SHADOWSOCKS': {
      const method =
        typeof raw.method === 'string' && raw.method.trim() ? raw.method.trim() : SS_DEFAULT_METHOD;
      // 2022-blake3 系列要求特定长度 base64 密钥，缺省时按方法自动生成
      let password = typeof raw.password === 'string' && raw.password ? raw.password : '';
      if (!password) {
        const keyBytes = method === '2022-blake3-aes-256-gcm' ? 32 : 16;
        password = randomBytes(keyBytes).toString('base64');
      }
      const params: ShadowsocksParams = { method, password };
      return params as unknown as Record<string, unknown>;
    }
    default:
      throw new BadRequestException(`不支持的入站协议：${type as string}`);
  }
}

// API 输出脱敏：剥离私钥（订阅/网关内部查询走原始 paramsJson，不经此函数）
export function sanitizeInboundParams(params: Record<string, unknown>): Record<string, unknown> {
  const clone = { ...params };
  delete clone.privateKey;
  return clone;
}

// 组装 sing-box 服务端入站 JSON（config_sync 的 inbounds 元素）
export function buildServerInbound(input: {
  type: ProtocolType;
  tag: string;
  listen: string;
  port: number;
  params: Record<string, unknown>;
  users: InboundUserCredential[];
}): Record<string, unknown> {
  const { type, tag, listen, port, params, users } = input;
  switch (type) {
    case 'VLESS_REALITY': {
      const p = params as unknown as VlessRealityParams;
      const { host, port: destPort } = parseDest(p.dest);
      return {
        type: 'vless',
        tag,
        listen,
        listen_port: port,
        users: users.map((u) => ({ uuid: u.uuid, name: u.email, flow: p.flow })),
        tls: {
          enabled: true,
          server_name: p.serverNames[0],
          reality: {
            enabled: true,
            handshake: { server: host, server_port: destPort },
            private_key: p.privateKey,
            short_id: p.shortIds
          }
        }
      };
    }
    case 'HYSTERIA2': {
      const p = params as unknown as Hysteria2Params;
      return {
        type: 'hysteria2',
        tag,
        listen,
        listen_port: port,
        ...(p.upMbps > 0 ? { up_mbps: p.upMbps } : {}),
        ...(p.downMbps > 0 ? { down_mbps: p.downMbps } : {}),
        users: users.map((u) => ({ name: u.email, password: u.credential })),
        tls: {
          enabled: true,
          server_name: p.tls.serverName,
          alpn: p.tls.alpn,
          certificate_path: p.tls.certificatePath,
          key_path: p.tls.keyPath
        }
      };
    }
    case 'TUIC': {
      const p = params as unknown as TuicParams;
      return {
        type: 'tuic',
        tag,
        listen,
        listen_port: port,
        users: users.map((u) => ({ uuid: u.uuid, name: u.email, password: u.credential })),
        congestion_control: p.congestionControl,
        tls: {
          enabled: true,
          server_name: p.tls.serverName,
          alpn: p.tls.alpn,
          certificate_path: p.tls.certificatePath,
          key_path: p.tls.keyPath
        }
      };
    }
    case 'SHADOWSOCKS': {
      const p = params as unknown as ShadowsocksParams;
      // SS 入站为共享密码模式：按用户流量归属在 SS 协议下不可用（本就暂缓，见架构文档 §2.2）
      return {
        type: 'shadowsocks',
        tag,
        listen,
        listen_port: port,
        method: p.method,
        password: p.password
      };
    }
    default:
      throw new BadRequestException(`不支持的入站协议：${type as string}`);
  }
}
