// 角色与节点状态常量（SQLite 无 enum，应用层以此校验，见 docs/DATA_MODELS.md）
export const ROLES = ['ADMIN', 'USER'] as const;
export type Role = (typeof ROLES)[number];

export const NODE_STATUSES = ['ONLINE', 'OFFLINE', 'DISABLED'] as const;
export type NodeStatus = (typeof NODE_STATUSES)[number];

export const PROTOCOL_TYPES = ['VLESS_REALITY', 'HYSTERIA2', 'SHADOWSOCKS', 'TUIC'] as const;
export type ProtocolType = (typeof PROTOCOL_TYPES)[number];

// 心跳超时判定：超过该秒数未见心跳即视为离线
export const HEARTBEAT_TIMEOUT_SECONDS = 30;
