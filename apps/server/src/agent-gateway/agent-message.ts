// Master ↔ Agent WS 消息帧（契约见 docs/API_AND_PROTOCOLS.md §WS 协议）
export type AgentMessageType =
  | 'auth_result'
  | 'config_sync'
  | 'config_apply_result'
  | 'heartbeat';

export interface AgentMessage<T = unknown> {
  type: AgentMessageType;
  data: T;
}

export interface AuthResultData {
  success: boolean;
  message: string;
  nodeId: string | null;
}

export interface HeartbeatTrafficRecord {
  userUuid: string;
  upload: number;
  download: number;
}

export interface HeartbeatData {
  cpuUsage: number;
  memoryUsage: number;
  bandwidthRate: number;
  trafficRecords: HeartbeatTrafficRecord[];
  // 可选字段（v0.3.0，向后兼容：旧版 Agent 不上报）
  kernelRunning?: boolean; // 内核进程存活
  appliedConfigVersion?: number; // 当前生效配置版本
  lastError?: string; // 最近一次失败原因（check 失败/启动失败/异常退出 stderr 尾部）
}

// config_sync 的处理回执（Agent -> Master，v0.3.0）
export interface ConfigApplyResultData {
  version: number;
  success: boolean;
  message: string;
}

export interface ConfigSyncData {
  version: number;
  singboxConfig: Record<string, unknown>;
}
