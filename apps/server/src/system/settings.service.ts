import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// SystemSetting 键定义（键名与取值格式见 docs/DATA_MODELS.md §SystemSetting）
export const SETTING_KEYS = {
  SITE_NAME: 'siteName',
  REGISTRATION_ENABLED: 'registrationEnabled',
  DEFAULT_TRAFFIC_LIMIT_BYTES: 'defaultTrafficLimitBytes'
} as const;

export interface SystemSettings {
  siteName: string;
  registrationEnabled: boolean;
  defaultTrafficLimitBytes: number;
}

// 默认值：键缺失或值非法时回退（新库首次读取无需预先 seed）
const DEFAULTS: SystemSettings = {
  siteName: 'RiriCloud',
  registrationEnabled: false,
  defaultTrafficLimitBytes: 107374182400 // 100 GiB
};

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  // 读取全量设置并与默认值合并；value 解析失败时使用默认值
  async getSettings(): Promise<SystemSettings> {
    const rows = await this.prisma.systemSetting.findMany({
      where: { key: { in: Object.values(SETTING_KEYS) } }
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));

    const siteName = map.get(SETTING_KEYS.SITE_NAME);
    const registrationEnabled = map.get(SETTING_KEYS.REGISTRATION_ENABLED);
    const defaultQuota = map.get(SETTING_KEYS.DEFAULT_TRAFFIC_LIMIT_BYTES);

    const quota = Number(defaultQuota);
    return {
      siteName: siteName && siteName.trim() ? siteName.trim() : DEFAULTS.siteName,
      registrationEnabled: registrationEnabled === 'true',
      defaultTrafficLimitBytes:
        defaultQuota && Number.isFinite(quota) && quota > 0 ? quota : DEFAULTS.defaultTrafficLimitBytes
    };
  }

  // 部分更新（任意子集 upsert），返回全量
  async updateSettings(patch: Partial<SystemSettings>): Promise<SystemSettings> {
    const entries: Array<{ key: string; value: string; description: string }> = [];
    if (patch.siteName !== undefined) {
      entries.push({
        key: SETTING_KEYS.SITE_NAME,
        value: patch.siteName,
        description: '站点名称'
      });
    }
    if (patch.registrationEnabled !== undefined) {
      entries.push({
        key: SETTING_KEYS.REGISTRATION_ENABLED,
        value: String(patch.registrationEnabled),
        description: '是否开放注册'
      });
    }
    if (patch.defaultTrafficLimitBytes !== undefined) {
      entries.push({
        key: SETTING_KEYS.DEFAULT_TRAFFIC_LIMIT_BYTES,
        value: String(patch.defaultTrafficLimitBytes),
        description: '新用户默认流量配额（字节）'
      });
    }
    for (const entry of entries) {
      await this.prisma.systemSetting.upsert({
        where: { key: entry.key },
        update: { value: entry.value },
        create: entry
      });
    }
    return this.getSettings();
  }

  // 供注册/创建用户读取默认配额
  async getDefaultQuota(): Promise<number> {
    return (await this.getSettings()).defaultTrafficLimitBytes;
  }
}
