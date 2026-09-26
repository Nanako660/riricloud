import i18n from '@/i18n/config';
import type { BinaryDeployment, BinaryStatus } from './use-binaries';

export const BINARY_STATUS_LABELS = new Proxy({} as Record<BinaryStatus, string>, {
  get(_, prop: BinaryStatus) {
    const map: Record<BinaryStatus, string> = {
      DRAFT: i18n.t('admin:binaries.statusDraft'),
      ACTIVE: i18n.t('admin:binaries.statusActive'),
      DISABLED: i18n.t('admin:binaries.statusDisabled'),
      RETIRED: i18n.t('admin:binaries.statusRetired')
    };
    return map[prop] ?? prop;
  }
});

export const BINARY_DEPLOYMENT_STATUS_LABELS = new Proxy({} as Record<string, string>, {
  get(_, prop: string) {
    const map: Record<string, string> = {
      QUEUED: i18n.t('admin:binaries.deployQueued'),
      DISPATCHED: i18n.t('admin:binaries.deployDispatched'),
      COMPLETED: i18n.t('admin:binaries.deployCompleted'),
      FAILED: i18n.t('admin:binaries.deployFailed')
    };
    return map[prop] ?? prop;
  }
});

export const BINARY_COMPATIBILITY_LABELS = new Proxy({} as Record<string, string>, {
  get(_, prop: string) {
    const map: Record<string, string> = {
      minAgentProtocolVersion: i18n.t('admin:binaries.compatMinAgentProtocolVersion'),
      maxAgentProtocolVersion: i18n.t('admin:binaries.compatMaxAgentProtocolVersion'),
      minAgentVersion: i18n.t('admin:binaries.compatMinAgentVersion'),
      maxAgentVersion: i18n.t('admin:binaries.compatMaxAgentVersion'),
      cronetVersion: i18n.t('admin:binaries.compatCronetVersion')
    };
    return map[prop] ?? prop;
  }
});

export function sourceLabel(source: string) {
  const map: Record<string, string> = {
    BUILTIN: i18n.t('admin:binaries.sourceLocal'),
    LOCAL: i18n.t('admin:binaries.sourceLocal'),
    UPLOAD: i18n.t('admin:binaries.sourceUpload'),
    REMOTE: i18n.t('admin:binaries.sourceRemote'),
    GITHUB: i18n.t('admin:binaries.sourceGithub')
  };
  return map[source] ?? source;
}

export function operationLabel(operation: string) {
  const map: Record<string, string> = {
    UPGRADE: i18n.t('admin:binaries.opUpgrade'),
    ROLLBACK: i18n.t('admin:binaries.opRollback')
  };
  return map[operation] ?? operation;
}

export function formatTargetBadge(target: string) {
  return target.replace(/^agent-/, '').replace('-', '/');
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
    return { ok: false, message: i18n.t('admin:binaries.compatMustBeJson') };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, message: i18n.t('admin:binaries.compatMustBeObject') };
  }
  const numberKeys = ['minAgentProtocolVersion', 'maxAgentProtocolVersion'];
  const stringKeys = ['minAgentVersion', 'maxAgentVersion', 'cronetVersion'];
  for (const [key, value] of Object.entries(parsed)) {
    if (numberKeys.includes(key)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return { ok: false, message: i18n.t('admin:binaries.compatFieldMustBeNumber', { field: key }) };
      continue;
    }
    if (stringKeys.includes(key)) {
      if (typeof value !== 'string') return { ok: false, message: i18n.t('admin:binaries.compatFieldMustBeString', { field: key }) };
      continue;
    }
    return { ok: false, message: i18n.t('admin:binaries.compatUnsupportedField', { field: key }) };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

export function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

// 与服务端 verifyAssetsAvailability 对应：available=false 表示磁盘文件缺失或校验不符。
export const getAssetUnavailableLabel = () => i18n.t('admin:binaries.assetUnavailable');

export function totalAssetBytes(assets: Array<{ size: number; available?: boolean }>) {
  return bytes(assets.reduce((sum, asset) => sum + (asset.available === false ? 0 : asset.size || 0), 0));
}

// 所有资源均可直接删除，删除可释放空间与可用资产总大小一致。
export function reclaimableAssetBytes(assets: Array<{ size: number; storageRoot?: string; available?: boolean }>) {
  return totalAssetBytes(assets);
}

export function deploymentBadgeVariant(status: BinaryDeployment['status']) {
  if (status === 'COMPLETED') return 'default' as const;
  if (status === 'FAILED') return 'destructive' as const;
  return 'secondary' as const;
}
