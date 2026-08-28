// Master ↔ Agent WS 消息帧（契约见 docs/API_AND_PROTOCOLS.md §WS 协议）
export type AgentMessageType = 'auth_result' | 'config_sync' | 'heartbeat';

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
}

export interface ConfigSyncData {
  version: number;
  singboxConfig: Record<string, unknown>;
}
