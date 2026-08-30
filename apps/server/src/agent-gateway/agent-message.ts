// Master ↔ Agent WS 消息帧（契约见 docs/API_AND_PROTOCOLS.md §WS 协议）
export type AgentMessageType =
  | 'auth_result'
  | 'config_sync'
  | 'config_apply_result'
  | 'heartbeat'
  | 'upgrade_task'
  | 'upgrade_result'
  | 'probe_task'
  | 'probe_result';

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

export type UpgradeTarget = 'singbox' | 'agent';

export interface UpgradeTaskData {
  taskId: string;
  target: UpgradeTarget;
  version: string;
  url: string;
  sha256: string;
}

export interface UpgradeResultData {
  taskId: string;
  target: UpgradeTarget;
  version: string;
  success: boolean;
  message: string;
}

export type ProbeType = 'tcp' | 'dns' | 'icmp';

export interface ProbeRequest {
  type: ProbeType;
  target: string;
  port?: number;
  timeoutMs?: number;
}

export interface ProbeTaskData {
  taskId: string;
  probes: ProbeRequest[];
}

export interface ProbeResult {
  type: ProbeType;
  target: string;
  success: boolean;
  latencyMs?: number;
  message?: string;
}

export interface ProbeResultData {
  taskId: string;
  success: boolean;
  results: ProbeResult[];
}

export type AgentInboundMessage =
  | AgentMessage<HeartbeatData> & { type: 'heartbeat' }
  | AgentMessage<ConfigApplyResultData> & { type: 'config_apply_result' }
  | AgentMessage<UpgradeResultData> & { type: 'upgrade_result' }
  | AgentMessage<ProbeResultData> & { type: 'probe_result' };

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown, maxLength = 8192): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isProbeType(value: unknown): value is ProbeType {
  return value === 'tcp' || value === 'dns' || value === 'icmp';
}

function isHeartbeatData(value: unknown): value is HeartbeatData {
  if (!isJsonObject(value)) return false;
  if (!isFiniteNumber(value.cpuUsage) || value.cpuUsage < 0 || value.cpuUsage > 100) return false;
  if (!isFiniteNumber(value.memoryUsage) || value.memoryUsage < 0 || value.memoryUsage > 100) return false;
  if (!isFiniteNumber(value.bandwidthRate) || value.bandwidthRate < 0) return false;
  if (!Array.isArray(value.trafficRecords)) return false;
  if (
    value.kernelRunning !== undefined &&
    typeof value.kernelRunning !== 'boolean'
  ) return false;
  if (
    value.appliedConfigVersion !== undefined &&
    !isSafeNonNegativeInteger(value.appliedConfigVersion)
  ) return false;
  if (value.lastError !== undefined && (typeof value.lastError !== 'string' || value.lastError.length > 8192)) {
    return false;
  }
  return value.trafficRecords.every((record) => {
    if (!isJsonObject(record)) return false;
    return (
      isNonEmptyString(record.userUuid, 256) &&
      isSafeNonNegativeInteger(record.upload) &&
      isSafeNonNegativeInteger(record.download)
    );
  });
}

function isConfigApplyResultData(value: unknown): value is ConfigApplyResultData {
  return (
    isJsonObject(value) &&
    isSafeNonNegativeInteger(value.version) &&
    typeof value.success === 'boolean' &&
    typeof value.message === 'string' &&
    value.message.length <= 8192
  );
}

function isUpgradeResultData(value: unknown): value is UpgradeResultData {
  return (
    isJsonObject(value) &&
    isNonEmptyString(value.taskId, 128) &&
    (value.target === 'singbox' || value.target === 'agent') &&
    isNonEmptyString(value.version, 128) &&
    typeof value.success === 'boolean' &&
    typeof value.message === 'string' &&
    value.message.length <= 8192
  );
}

function isProbeResultData(value: unknown): value is ProbeResultData {
  if (!isJsonObject(value) || !isNonEmptyString(value.taskId, 128) || typeof value.success !== 'boolean') {
    return false;
  }
  if (!Array.isArray(value.results) || value.results.length > 8) return false;
  return value.results.every((result) => {
    if (!isJsonObject(result)) return false;
    if (!isProbeType(result.type) || !isNonEmptyString(result.target, 1024) || typeof result.success !== 'boolean') {
      return false;
    }
    return (
      (result.latencyMs === undefined || isSafeNonNegativeInteger(result.latencyMs)) &&
      (result.message === undefined || (typeof result.message === 'string' && result.message.length <= 8192))
    );
  });
}

// 解析并校验 Agent 上行消息，避免类型断言绕过外部输入校验。
export function parseAgentInboundMessage(raw: string): AgentInboundMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isJsonObject(parsed) || !isJsonObject(parsed.data) || typeof parsed.type !== 'string') {
    return null;
  }

  switch (parsed.type) {
    case 'heartbeat':
      return isHeartbeatData(parsed.data)
        ? { type: parsed.type, data: parsed.data }
        : null;
    case 'config_apply_result':
      return isConfigApplyResultData(parsed.data)
        ? { type: parsed.type, data: parsed.data }
        : null;
    case 'upgrade_result':
      return isUpgradeResultData(parsed.data)
        ? { type: parsed.type, data: parsed.data }
        : null;
    case 'probe_result':
      return isProbeResultData(parsed.data)
        ? { type: parsed.type, data: parsed.data }
        : null;
    default:
      return null;
  }
}
