// 角色与节点状态常量（SQLite 无 enum，应用层以此校验，见 docs/DATA_MODELS.md）
export const ROLES = ['ADMIN', 'USER'] as const;
export type Role = (typeof ROLES)[number];

export const NODE_STATUSES = ['ONLINE', 'OFFLINE', 'DISABLED'] as const;
export type NodeStatus = (typeof NODE_STATUSES)[number];

export const PROTOCOL_TYPES = [
  'VLESS',
  'VMESS',
  'TROJAN',
  'HYSTERIA2',
  'TUIC',
  'SHADOWSOCKS',
  'NAIVE',
  'SHADOWTLS',
  'MIXED',
  'SOCKS',
  'HTTP',
  'DIRECT'
] as const;
export type ProtocolType = (typeof PROTOCOL_TYPES)[number];

export const LINE_TYPES = ['DIRECT', 'RELAY'] as const;
export type LineType = (typeof LINE_TYPES)[number];

export const RELAY_MODES = ['BLIND_FORWARD', 'PROTOCOL_PROXY'] as const;
export type RelayMode = (typeof RELAY_MODES)[number];

// 可被协议重加密中继作为目标的协议；纯本地代理和传输层协议没有对应的统一出站。
export const PROTOCOL_PROXY_TARGET_TYPES = [
  'VLESS',
  'VMESS',
  'TROJAN',
  'HYSTERIA2',
  'TUIC',
  'SHADOWSOCKS',
  'NAIVE'
] as const;
export type ProtocolProxyTargetType = (typeof PROTOCOL_PROXY_TARGET_TYPES)[number];

export const LINE_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export type LineStatus = (typeof LINE_STATUSES)[number];

// 心跳超时判定：超过该秒数未见心跳即视为离线
export const HEARTBEAT_TIMEOUT_SECONDS = 30;
