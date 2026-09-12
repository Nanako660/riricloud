import type { BinaryDeployment, BinaryStatus } from './use-binaries';

export const BINARY_STATUS_LABELS: Record<BinaryStatus, string> = {
  DRAFT: '草稿',
  ACTIVE: '启用',
  DISABLED: '停用',
  RETIRED: '归档'
};

export const BINARY_AUDIT_ACTION_LABELS: Record<string, string> = {
  RESOURCE_IMPORTED: '导入/上传',
  RESOURCE_UPDATED: '更新信息',
  RESOURCE_ACTIVATED: '启用',
  RESOURCE_DISABLED: '停用',
  RESOURCE_RETIRED: '归档',
  RESOURCE_RESTORED: '恢复',
  RESOURCE_DEFAULT_CHANGED: '切换默认',
  RESOURCE_DELETED: '删除'
};

export const BINARY_DEPLOYMENT_STATUS_LABELS: Record<string, string> = {
  QUEUED: '排队中',
  DISPATCHED: '已下发',
  COMPLETED: '已完成',
  FAILED: '失败'
};

export const BINARY_COMPATIBILITY_LABELS: Record<string, string> = {
  minAgentProtocolVersion: '最低协议版本',
  maxAgentProtocolVersion: '最高协议版本',
  minAgentVersion: '最低 Agent 版本',
  maxAgentVersion: '最高 Agent 版本',
  cronetVersion: 'Cronet 版本'
};

export function sourceLabel(source: string) {
  return { BUILTIN: '内置', UPLOAD: '上传', REMOTE: '远程导入' }[source] ?? source;
}

export function operationLabel(operation: string) {
  return { UPGRADE: '升级', ROLLBACK: '回滚' }[operation] ?? operation;
}

export function formatTargetBadge(target: string) {
  return target.replace(/^(agent|singbox)-/, '').replace('-', '/');
}

export function compatibilityEntries(compatibilityJson: string): Array<[string, unknown]> {
  try {
    const parsed = JSON.parse(compatibilityJson || '{}') as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
    return Object.entries(parsed);
  } catch {
    return [];
  }
}

// 客户端校验兼容性约束键与类型，与服务端 normalizeCompatibility 保持一致。
export function validateCompatibilityText(text: string): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: '必须是合法 JSON' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, message: '必须是 JSON 对象' };
  }
  const numberKeys = ['minAgentProtocolVersion', 'maxAgentProtocolVersion'];
  const stringKeys = ['minAgentVersion', 'maxAgentVersion', 'cronetVersion'];
  for (const [key, value] of Object.entries(parsed)) {
    if (numberKeys.includes(key)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return { ok: false, message: `字段 ${key} 必须为数字` };
      continue;
    }
    if (stringKeys.includes(key)) {
      if (typeof value !== 'string') return { ok: false, message: `字段 ${key} 必须为字符串` };
      continue;
    }
    return { ok: false, message: `不支持的兼容性字段: ${key}` };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

export function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

export function totalAssetBytes(assets: Array<{ size: number }>) {
  return bytes(assets.reduce((sum, asset) => sum + (asset.size || 0), 0));
}

export function deploymentBadgeVariant(status: BinaryDeployment['status']) {
  if (status === 'COMPLETED') return 'default' as const;
  if (status === 'FAILED') return 'destructive' as const;
  return 'secondary' as const;
}
