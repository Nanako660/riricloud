
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type EmailDomainMode = 'none' | 'whitelist' | 'blacklist';
export type ProbePresetType = 'tcp' | 'dns' | 'icmp';

export interface ProbePresetTarget {
  type: ProbePresetType;
  target: string;
  port?: number;
  timeoutMs?: number;
}

// SystemSetting 键定义（键名与取值格式见 docs/DATA_MODELS.md §SystemSetting）
export const SETTING_KEYS = {
  SITE_NAME: 'siteName',
  SITE_DESCRIPTION: 'siteDescription',
  PUBLIC_BASE_URL: 'publicBaseUrl',
  LOGO_URL: 'logoUrl',
  FAVICON_URL: 'faviconUrl',
  SITE_ANNOUNCEMENT: 'siteAnnouncement',
  FOOTER_COPYRIGHT: 'footerCopyright',
  SUPPORT_TELEGRAM_URL: 'supportTelegramUrl',
  SUPPORT_DISCORD_URL: 'supportDiscordUrl',
  SUPPORT_EMAIL: 'supportEmail',
  SUPPORT_CUSTOM_URL: 'supportCustomUrl',
  REGISTRATION_ENABLED: 'registrationEnabled',
  DEFAULT_PLAN_ID: 'defaultPlanId',
  DEFAULT_TRAFFIC_LIMIT_BYTES: 'defaultTrafficLimitBytes',
  DEFAULT_VALIDITY_DAYS: 'defaultValidityDays',
  EMAIL_DOMAIN_MODE: 'emailDomainMode',
  EMAIL_DOMAIN_LIST: 'emailDomainList',
  PASSWORD_MIN_LENGTH: 'passwordMinLength',
  SUBSCRIPTION_BASE_URL: 'subscriptionBaseUrl',
  SUBSCRIPTION_SHORT_LINKS_ENABLED: 'subscriptionShortLinksEnabled',
  SUBSCRIPTION_UPDATE_INTERVAL_HOURS: 'subscriptionUpdateIntervalHours',
  DEFAULT_TEMPLATE_ID: 'defaultTemplateId',
  PUBLIC_LINES_ENABLED: 'publicLinesEnabled',
  INCLUDE_USAGE_HEADERS: 'includeUsageHeaders',
  HEARTBEAT_TIMEOUT_SECS: 'heartbeatTimeoutSecs',
  CONFIG_SYNC_DEBOUNCE_MS: 'configSyncDebounceMs',
  DEFAULT_POLL_INTERVAL_SECS: 'defaultPollIntervalSecs',
  BINARY_DOWNLOAD_BASE_URL: 'binaryDownloadBaseUrl',
  PROBE_PRESET_TARGETS: 'probePresetTargets',
  JWT_SESSION_DAYS: 'jwtSessionDays',
  CUSTOM_CSS: 'customCss',
  CUSTOM_HEAD_HTML: 'customHeadHtml'
} as const;

export interface SystemSettings {
  siteName: string;
  siteDescription: string;
  publicBaseUrl: string;
  logoUrl: string;
  faviconUrl: string;
  siteAnnouncement: string;
  footerCopyright: string;
  supportTelegramUrl: string;
  supportDiscordUrl: string;
  supportEmail: string;
  supportCustomUrl: string;
  registrationEnabled: boolean;
  defaultPlanId: string | null;
  defaultTrafficLimitBytes: number;
  defaultValidityDays: number;
  emailDomainMode: EmailDomainMode;
  emailDomainList: string[];
  passwordMinLength: number;
  subscriptionBaseUrl: string;
  subscriptionShortLinksEnabled: boolean;
  subscriptionUpdateIntervalHours: number;
  defaultTemplateId: string | null;
  publicLinesEnabled: boolean;
  includeUsageHeaders: boolean;
  heartbeatTimeoutSecs: number;
  configSyncDebounceMs: number;
  defaultPollIntervalSecs: number;
  binaryDownloadBaseUrl: string;
  probePresetTargets: ProbePresetTarget[];
  jwtSessionDays: number;
  customCss: string;
  customHeadHtml: string;
}

export type SystemSettingsPatch = {
  [K in keyof SystemSettings]?: SystemSettings[K] | null;
};

export type PublicSystemSettings = Pick<
  SystemSettings,
  | 'siteName'
  | 'siteDescription'
  | 'logoUrl'
  | 'faviconUrl'
  | 'siteAnnouncement'
  | 'footerCopyright'
  | 'supportTelegramUrl'
  | 'supportDiscordUrl'
  | 'supportEmail'
  | 'supportCustomUrl'
  | 'registrationEnabled'
  | 'subscriptionBaseUrl'
  | 'subscriptionShortLinksEnabled'
  | 'customCss'
  | 'customHeadHtml'
>;

export const DEFAULTS: SystemSettings = {
  siteName: 'RiriCloud',
  siteDescription: '多节点代理管理面板',
  publicBaseUrl: '',
  logoUrl: '',
  faviconUrl: '',
  siteAnnouncement: '',
  footerCopyright: '',
  supportTelegramUrl: '',
  supportDiscordUrl: '',
  supportEmail: '',
  supportCustomUrl: '',
  registrationEnabled: false,
  defaultPlanId: null,
  defaultTrafficLimitBytes: 107374182400,
  defaultValidityDays: 0,
  emailDomainMode: 'none',
  emailDomainList: [],
  passwordMinLength: 8,
  subscriptionBaseUrl: '',
  subscriptionShortLinksEnabled: false,
  subscriptionUpdateIntervalHours: 24,
  defaultTemplateId: null,
  publicLinesEnabled: true,
  includeUsageHeaders: true,
  heartbeatTimeoutSecs: 15,
  configSyncDebounceMs: 250,
  defaultPollIntervalSecs: 15,
  binaryDownloadBaseUrl: '',
  probePresetTargets: [
    { type: 'tcp', target: 'www.apple.com', port: 443, timeoutMs: 5000 },
    { type: 'dns', target: 'cloudflare.com', timeoutMs: 5000 }
  ],
  jwtSessionDays: 1,
  customCss: '',
  customHeadHtml: ''
};

const DESCRIPTIONS: Record<keyof SystemSettings, string> = {
  siteName: '站点名称',
  siteDescription: '站点副标题描述',
  publicBaseUrl: '全站对外访问地址',
  logoUrl: '站点 Logo 地址',
  faviconUrl: '站点 Favicon 地址',
  siteAnnouncement: '全局公告横幅',
  footerCopyright: '页脚版权信息',
  supportTelegramUrl: 'Telegram 客服或群组地址',
  supportDiscordUrl: 'Discord 客服或群组地址',
  supportEmail: '客服邮箱',
  supportCustomUrl: '自定义客服支持地址',
  registrationEnabled: '是否开放注册',
  defaultPlanId: '新用户默认套餐',
  defaultTrafficLimitBytes: '新用户默认流量配额（字节）',
  defaultValidityDays: '新用户默认有效天数',
  emailDomainMode: '邮箱域名过滤模式',
  emailDomainList: '邮箱域名过滤列表',
  passwordMinLength: '密码最小长度',
  subscriptionBaseUrl: '对外订阅基准地址',
  subscriptionShortLinksEnabled: '是否使用 Nginx 伪静态短订阅链接',
  subscriptionUpdateIntervalHours: '客户端订阅更新周期（小时）',
  defaultTemplateId: '全局默认订阅模板',
  publicLinesEnabled: '是否公开线路列表',
  includeUsageHeaders: '是否注入订阅用量响应头',
  heartbeatTimeoutSecs: 'Agent 心跳离线判定超时（秒）',
  configSyncDebounceMs: '配置同步防抖延迟（毫秒）',
  defaultPollIntervalSecs: 'Agent 默认 HTTP 轮询周期（秒）',
  binaryDownloadBaseUrl: '二进制分发基准地址',
  probePresetTargets: '默认网络探针目标列表',
  jwtSessionDays: 'JWT 会话有效天数',
  customCss: '自定义 CSS 样式',
  customHeadHtml: '自定义 HTML/JS 头部代码'
};

const SETTING_VALUES = Object.values(SETTING_KEYS);

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<SystemSettings> {
    const rows = await this.prisma.systemSetting.findMany({ where: { key: { in: SETTING_VALUES } } });
    const map = new Map(rows.map((row) => [row.key, row.value]));
    return {
      siteName: this.readString(map, 'siteName'),
      siteDescription: this.readString(map, 'siteDescription'),
      publicBaseUrl: this.readString(map, 'publicBaseUrl'),
      logoUrl: this.readString(map, 'logoUrl'),
      faviconUrl: this.readString(map, 'faviconUrl'),
      siteAnnouncement: this.readString(map, 'siteAnnouncement'),
      footerCopyright: this.readString(map, 'footerCopyright'),
      supportTelegramUrl: this.readString(map, 'supportTelegramUrl'),
      supportDiscordUrl: this.readString(map, 'supportDiscordUrl'),
      supportEmail: this.readString(map, 'supportEmail'),
      supportCustomUrl: this.readString(map, 'supportCustomUrl'),
      registrationEnabled: this.readBoolean(map, 'registrationEnabled'),
      defaultPlanId: this.readNullableString(map, 'defaultPlanId'),
      defaultTrafficLimitBytes: this.readInteger(map, 'defaultTrafficLimitBytes', 1, Number.MAX_SAFE_INTEGER),
      defaultValidityDays: this.readInteger(map, 'defaultValidityDays', 0, 3650),
      emailDomainMode: this.readEnum(map, 'emailDomainMode', ['none', 'whitelist', 'blacklist']),
      emailDomainList: this.readStringArray(map, 'emailDomainList').map(normalizeDomain).filter(Boolean),
      passwordMinLength: this.readInteger(map, 'passwordMinLength', 8, 64),
      subscriptionBaseUrl: this.readString(map, 'subscriptionBaseUrl'),
      subscriptionShortLinksEnabled: this.readBoolean(map, 'subscriptionShortLinksEnabled'),
      subscriptionUpdateIntervalHours: this.readInteger(map, 'subscriptionUpdateIntervalHours', 1, 168),
      defaultTemplateId: this.readNullableString(map, 'defaultTemplateId'),
      publicLinesEnabled: this.readBoolean(map, 'publicLinesEnabled'),
      includeUsageHeaders: this.readBoolean(map, 'includeUsageHeaders'),
      heartbeatTimeoutSecs: this.readInteger(map, 'heartbeatTimeoutSecs', 5, 3600),
      configSyncDebounceMs: this.readInteger(map, 'configSyncDebounceMs', 0, 10000),
      defaultPollIntervalSecs: this.readInteger(map, 'defaultPollIntervalSecs', 5, 300),
      binaryDownloadBaseUrl: this.readString(map, 'binaryDownloadBaseUrl'),
      probePresetTargets: this.readProbePresets(map),
      jwtSessionDays: this.readInteger(map, 'jwtSessionDays', 1, 30),
      customCss: this.readString(map, 'customCss'),
      customHeadHtml: this.readString(map, 'customHeadHtml')
    };
  }

  async getPublicSettings(): Promise<PublicSystemSettings> {
    const settings = await this.getSettings();
    return {
      siteName: settings.siteName,
      siteDescription: settings.siteDescription,
      logoUrl: settings.logoUrl,
      faviconUrl: settings.faviconUrl,
      siteAnnouncement: settings.siteAnnouncement,
      footerCopyright: settings.footerCopyright,
      supportTelegramUrl: settings.supportTelegramUrl,
      supportDiscordUrl: settings.supportDiscordUrl,
      supportEmail: settings.supportEmail,
      supportCustomUrl: settings.supportCustomUrl,
      registrationEnabled: settings.registrationEnabled,
      subscriptionBaseUrl: settings.subscriptionBaseUrl,
      subscriptionShortLinksEnabled: settings.subscriptionShortLinksEnabled,
      customCss: settings.customCss,
      customHeadHtml: settings.customHeadHtml
    };
  }

  async updateSettings(patch: SystemSettingsPatch): Promise<SystemSettings> {
    await this.validateReferences(patch);
    const entries = Object.entries(patch).filter(([key]) => key in DEFAULTS) as Array<[
      keyof SystemSettings,
      SystemSettings[keyof SystemSettings]
    ]>;
    if (!entries.length) throw new BadRequestException('未提供任何有效设置字段');

    const operations = entries.map(([key, value]) => {
      const normalized = this.normalizeForStorage(key, value);
      return this.prisma.systemSetting.upsert({
        where: { key },
        update: { value: normalized },
        create: { key, value: normalized, description: DESCRIPTIONS[key] }
      });
    });
    await this.prisma.$transaction(operations);
    return this.getSettings();
  }

  async resetToDefaults(keys?: Array<keyof SystemSettings>): Promise<SystemSettings> {
    const selected = keys?.length
      ? keys.filter((key): key is keyof SystemSettings => key in DEFAULTS)
      : (Object.keys(DEFAULTS) as Array<keyof SystemSettings>);
    if (keys && selected.length !== keys.length) throw new BadRequestException('包含无效的设置键');
    await this.prisma.systemSetting.deleteMany({ where: { key: { in: selected } } });
    return this.getSettings();
  }

  async getDefaultQuota(): Promise<number> {
    return (await this.getSettings()).defaultTrafficLimitBytes;
  }

  private async validateReferences(patch: SystemSettingsPatch) {
    if (patch.defaultPlanId) {
      const planDelegate = (this.prisma as unknown as {
        plan?: { findUnique: (args: Record<string, unknown>) => Promise<{ isPublic: boolean } | null> };
      }).plan;
      const plan = planDelegate ? await planDelegate.findUnique({ where: { id: patch.defaultPlanId } }) : null;
      if (planDelegate && (!plan || !plan.isPublic)) throw new NotFoundException('默认套餐不存在或未公开');
    }
    if (patch.defaultTemplateId) {
      const templateDelegate = (this.prisma as unknown as {
        subscriptionTemplate?: { findUnique: (args: Record<string, unknown>) => Promise<unknown> };
      }).subscriptionTemplate;
      if (templateDelegate && !(await templateDelegate.findUnique({ where: { id: patch.defaultTemplateId } }))) {
        throw new NotFoundException('默认订阅模板不存在');
      }
    }
  }

  private normalizeForStorage<K extends keyof SystemSettings>(key: K, value: SystemSettings[K] | null): string {
    if (Array.isArray(value)) return JSON.stringify(value);
    if (value === null) return '';
    if (typeof value === 'string') {
      return key === 'customCss' || key === 'customHeadHtml' ? value : value.trim();
    }
    return String(value);
  }

  private readString(map: Map<string, string>, key: keyof SystemSettings): string {
    const value = map.get(key);
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return trimmed || DEFAULTS[key] as string;
  }

  private readNullableString(map: Map<string, string>, key: keyof SystemSettings): string | null {
    const value = this.readString(map, key);
    return value || null;
  }

  private readBoolean(map: Map<string, string>, key: keyof SystemSettings): boolean {
    const value = map.get(key)?.trim().toLowerCase();
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    return DEFAULTS[key] as boolean;
  }

  private readInteger<K extends keyof SystemSettings>(map: Map<string, string>, key: K, min: number, max: number): number {
    const value = Number(map.get(key));
    return Number.isSafeInteger(value) && value >= min && value <= max ? value : DEFAULTS[key] as number;
  }

  private readEnum<K extends keyof SystemSettings, T extends string>(map: Map<string, string>, key: K, values: readonly T[]): T {
    const value = map.get(key)?.trim().toLowerCase();
    return values.includes(value as T) ? value as T : DEFAULTS[key] as unknown as T;
  }

  private readStringArray(map: Map<string, string>, key: keyof SystemSettings): string[] {
    try {
      const value: unknown = JSON.parse(map.get(key) ?? 'null');
      return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : DEFAULTS[key] as string[];
    } catch {
      return DEFAULTS[key] as string[];
    }
  }

  private readProbePresets(map: Map<string, string>): ProbePresetTarget[] {
    try {
      const value: unknown = JSON.parse(map.get('probePresetTargets') ?? 'null');
      if (!Array.isArray(value)) return DEFAULTS.probePresetTargets;
      return value.filter(isProbePresetTarget).slice(0, 32);
    } catch {
      return DEFAULTS.probePresetTargets;
    }
  }
}

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^@+/, '');
}

function isProbePresetTarget(value: unknown): value is ProbePresetTarget {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    (item.type === 'tcp' || item.type === 'dns' || item.type === 'icmp') &&
    typeof item.target === 'string' &&
    item.target.trim().length > 0 &&
    (item.port === undefined || Number.isInteger(item.port)) &&
    (item.timeoutMs === undefined || Number.isInteger(item.timeoutMs))
  );
}
