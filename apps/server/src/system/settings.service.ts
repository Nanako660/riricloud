
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { decryptSecret, encryptSecret } from '../common/secret-crypto';

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
  DEFAULT_BALANCE: 'defaultBalance',
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
  CUSTOM_HEAD_HTML: 'customHeadHtml',
  LINE_SPEEDTEST_ENABLED: 'lineSpeedtestEnabled',
  LINE_SPEEDTEST_INTERVAL_MINS: 'lineSpeedtestIntervalMins',
  LINE_SPEEDTEST_TARGET_URL: 'lineSpeedtestTargetUrl',
  LINE_SPEEDTEST_TIMEOUT_MS: 'lineSpeedtestTimeoutMs',
  SYSTEM_TIMEZONE: 'systemTimezone',
  SMTP_ENABLED: 'smtpEnabled',
  SMTP_HOST: 'smtpHost',
  SMTP_PORT: 'smtpPort',
  SMTP_SECURE: 'smtpSecure',
  SMTP_USER: 'smtpUser',
  SMTP_PASS: 'smtpPass',
  SMTP_FROM: 'smtpFrom',
  EMAIL_VERIFICATION_ENABLED: 'emailVerificationEnabled',
  ENFORCE_EMAIL_VERIFICATION: 'enforceEmailVerification',
  CAPTCHA_MODE: 'captchaMode',
  TURNSTILE_SITE_KEY: 'turnstileSiteKey',
  TURNSTILE_SECRET_KEY: 'turnstileSecretKey',
  LOGS_RETENTION_DAYS: 'logsRetentionDays',
  LOGS_MAX_COUNT: 'logsMaxCount'
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
  defaultBalance: number;
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
  lineSpeedtestEnabled: boolean;
  lineSpeedtestIntervalMins: number;
  lineSpeedtestTargetUrl: string;
  lineSpeedtestTimeoutMs: number;
  systemTimezone: string;
  smtpEnabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  emailVerificationEnabled: boolean;
  enforceEmailVerification: boolean;
  captchaMode: 'OFF' | 'LOCAL' | 'TURNSTILE';
  turnstileSiteKey: string;
  turnstileSecretKey: string;
  logsRetentionDays: number;
  logsMaxCount: number;
}

export type SystemSettingsPatch = {
  [K in keyof SystemSettings]?: SystemSettings[K] | null;
};

export type PublicSystemSettings = Pick<
  SystemSettings,
  | 'siteName'
  | 'siteDescription'
  | 'publicBaseUrl'
  | 'systemTimezone'
  | 'logoUrl'
  | 'faviconUrl'
  | 'siteAnnouncement'
  | 'footerCopyright'
  | 'supportTelegramUrl'
  | 'supportDiscordUrl'
  | 'supportEmail'
  | 'supportCustomUrl'
  | 'registrationEnabled'
  | 'passwordMinLength'
  | 'subscriptionBaseUrl'
  | 'subscriptionShortLinksEnabled'
  | 'customCss'
  | 'customHeadHtml'
  | 'emailVerificationEnabled'
  | 'enforceEmailVerification'
  | 'captchaMode'
  | 'turnstileSiteKey'
>;

export const DEFAULTS: SystemSettings = {
  siteName: 'RiriCloud',
  siteDescription: '',
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
  defaultBalance: 0,
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
  customHeadHtml: '',
  lineSpeedtestEnabled: true,
  lineSpeedtestIntervalMins: 30,
  lineSpeedtestTargetUrl: 'http://cp.cloudflare.com/generate_204',
  lineSpeedtestTimeoutMs: 3000,
  systemTimezone: 'Asia/Shanghai',
  smtpEnabled: false,
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: '',
  smtpPass: '',
  smtpFrom: '',
  emailVerificationEnabled: false,
  enforceEmailVerification: false,
  captchaMode: 'OFF',
  turnstileSiteKey: '',
  turnstileSecretKey: '',
  logsRetentionDays: 7,
  logsMaxCount: 100000
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
  defaultBalance: '新用户注册初始余额（分）',
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
  customHeadHtml: '自定义 HTML/JS 头部代码',
  lineSpeedtestEnabled: '是否开启线路自动定时测速',
  lineSpeedtestIntervalMins: '线路自动测速执行周期（分钟）',
  lineSpeedtestTargetUrl: '线路测速测试目标 URL',
  lineSpeedtestTimeoutMs: '线路测速单次超时阈值（毫秒）',
  systemTimezone: '系统统一时区',
  smtpEnabled: '是否启用 SMTP 发信服务',
  smtpHost: 'SMTP 服务器地址',
  smtpPort: 'SMTP 服务器端口',
  smtpSecure: 'SMTP 是否使用 SSL/TLS',
  smtpUser: 'SMTP 登录账号',
  smtpPass: 'SMTP 登录密码',
  smtpFrom: 'SMTP 发信人地址',
  emailVerificationEnabled: '是否启用注册邮箱验证',
  enforceEmailVerification: '强制邮箱验证以使用订阅',
  captchaMode: '人机验证模式',
  turnstileSiteKey: 'Cloudflare Turnstile Site Key',
  turnstileSecretKey: 'Cloudflare Turnstile Secret Key',
  logsRetentionDays: '系统日志保留天数',
  logsMaxCount: '系统日志最大保留条数'
};

const SETTING_VALUES = Object.values(SETTING_KEYS);

@Injectable()
export class SettingsService {
  private readonly changeListeners: Array<(patch: SystemSettingsPatch) => void> = [];

  constructor(private readonly prisma: PrismaService) {}

  onSettingsChange(listener: (patch: SystemSettingsPatch) => void) {
    this.changeListeners.push(listener);
  }

  private notifyChange(patch: SystemSettingsPatch) {
    for (const listener of this.changeListeners) {
      try {
        listener(patch);
      } catch {
        // 忽略监听器内部异常
      }
    }
  }

  async getSettings(): Promise<SystemSettings> {
    const rows = await this.prisma.systemSetting.findMany({ where: { key: { in: SETTING_VALUES } } });
    const map = new Map(rows.map((row) => [row.key, row.value]));
    for (const key of [SETTING_KEYS.SMTP_PASS, SETTING_KEYS.TURNSTILE_SECRET_KEY]) {
      const stored = map.get(key);
      if (stored) map.set(key, decryptSecret(stored));
    }
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
      defaultBalance: this.readInteger(map, 'defaultBalance', 0, Number.MAX_SAFE_INTEGER),
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
      customHeadHtml: this.readString(map, 'customHeadHtml'),
      lineSpeedtestEnabled: this.readBoolean(map, 'lineSpeedtestEnabled'),
      lineSpeedtestIntervalMins: this.readInteger(map, 'lineSpeedtestIntervalMins', 1, 1440),
      lineSpeedtestTargetUrl: this.readString(map, 'lineSpeedtestTargetUrl'),
      lineSpeedtestTimeoutMs: this.readInteger(map, 'lineSpeedtestTimeoutMs', 500, 30000),
      systemTimezone: this.readTimezone(map, 'systemTimezone'),
      smtpEnabled: this.readBoolean(map, 'smtpEnabled'),
      smtpHost: this.readString(map, 'smtpHost'),
      smtpPort: this.readInteger(map, 'smtpPort', 1, 65535),
      smtpSecure: this.readBoolean(map, 'smtpSecure'),
      smtpUser: this.readString(map, 'smtpUser'),
      smtpPass: this.readString(map, 'smtpPass'),
      smtpFrom: this.readString(map, 'smtpFrom'),
      emailVerificationEnabled: this.readBoolean(map, 'emailVerificationEnabled'),
      enforceEmailVerification: this.readBoolean(map, 'enforceEmailVerification'),
      captchaMode: this.readEnum(map, 'captchaMode', ['OFF', 'LOCAL', 'TURNSTILE']),
      turnstileSiteKey: this.readString(map, 'turnstileSiteKey'),
      turnstileSecretKey: this.readString(map, 'turnstileSecretKey'),
      logsRetentionDays: this.readInteger(map, 'logsRetentionDays', 1, 365),
      logsMaxCount: this.readInteger(map, 'logsMaxCount', 1000, 1000000)
    };
  }

  async getAdminSettings(): Promise<Omit<SystemSettings, 'smtpPass' | 'turnstileSecretKey'> & { smtpPass: string; turnstileSecretKey: string }> {
    const settings = await this.getSettings();
    return {
      ...settings,
      smtpPass: settings.smtpPass ? '********' : '',
      turnstileSecretKey: settings.turnstileSecretKey ? '********' : ''
    };
  }

  async getPublicSettings(): Promise<PublicSystemSettings> {
    const settings = await this.getSettings();
    return {
      siteName: settings.siteName,
      siteDescription: settings.siteDescription,
      publicBaseUrl: settings.publicBaseUrl,
      systemTimezone: settings.systemTimezone,
      logoUrl: settings.logoUrl,
      faviconUrl: settings.faviconUrl,
      siteAnnouncement: settings.siteAnnouncement,
      footerCopyright: settings.footerCopyright,
      supportTelegramUrl: settings.supportTelegramUrl,
      supportDiscordUrl: settings.supportDiscordUrl,
      supportEmail: settings.supportEmail,
      supportCustomUrl: settings.supportCustomUrl,
      registrationEnabled: settings.registrationEnabled,
      passwordMinLength: settings.passwordMinLength,
      subscriptionBaseUrl: settings.subscriptionBaseUrl,
      subscriptionShortLinksEnabled: settings.subscriptionShortLinksEnabled,
      customCss: settings.customCss,
      customHeadHtml: settings.customHeadHtml,
      emailVerificationEnabled: settings.emailVerificationEnabled,
      enforceEmailVerification: settings.enforceEmailVerification,
      captchaMode: settings.captchaMode,
      turnstileSiteKey: settings.turnstileSiteKey
    };
  }

  async updateSettings(patch: SystemSettingsPatch): Promise<SystemSettings> {
    await this.validateReferences(patch);
    const entries = Object.entries(patch).filter(([key]) => key in DEFAULTS) as Array<[
      keyof SystemSettings,
      SystemSettings[keyof SystemSettings]
    ]>;
    if (!entries.length) throw new BadRequestException('未提供任何有效设置字段');

    await this.prisma.$transaction(async (tx) => {
      for (const [key, value] of entries) {
        if ((key === 'smtpPass' || key === 'turnstileSecretKey') && value === '********') continue;
        const normalized = this.normalizeForStorage(key, value);
        const stored = key === 'smtpPass' || key === 'turnstileSecretKey' ? encryptSecret(normalized) : normalized;
        await tx.systemSetting.upsert({
          where: { key },
          update: { value: stored },
          create: { key, value: stored, description: DESCRIPTIONS[key] }
        });
      }

      const defaultTemplateId = entries.find(([key]) => key === 'defaultTemplateId')?.[1];
      if (typeof defaultTemplateId === 'string' && defaultTemplateId.trim()) {
        await tx.subscriptionTemplate.updateMany({ data: { isDefault: false } });
        await tx.subscriptionTemplate.update({
          where: { id: defaultTemplateId.trim() },
          data: { isDefault: true }
        });
      }
    });
    this.notifyChange(patch);
    return this.getAdminSettings();
  }

  async resetToDefaults(keys?: Array<keyof SystemSettings>): Promise<Omit<SystemSettings, 'smtpPass' | 'turnstileSecretKey'> & { smtpPass: string; turnstileSecretKey: string }> {
    const selected = keys?.length
      ? keys.filter((key): key is keyof SystemSettings => key in DEFAULTS)
      : (Object.keys(DEFAULTS) as Array<keyof SystemSettings>);
    if (keys && selected.length !== keys.length) throw new BadRequestException('包含无效的设置键');
    await this.prisma.systemSetting.deleteMany({ where: { key: { in: selected } } });
    this.notifyChange(DEFAULTS);
    return this.getAdminSettings();
  }

  private async validateReferences(patch: SystemSettingsPatch) {
    if (patch.systemTimezone !== undefined && patch.systemTimezone !== null && !isValidTimezone(patch.systemTimezone)) {
      throw new BadRequestException('无效的 IANA 时区标识符');
    }
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
    // 清理旧版本内置副标题，避免已有数据库继续展示开发默认文案。
    if (key === 'siteDescription' && trimmed === '多节点代理管理面板') return '';
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
    return values.find((item) => item.toLowerCase() === value) ?? DEFAULTS[key] as unknown as T;
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

  private readTimezone(map: Map<string, string>, key: keyof SystemSettings): string {
    const value = map.get(key)?.trim();
    if (value && isValidTimezone(value)) {
      return value;
    }
    return DEFAULTS[key] as string;
  }
}

export function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
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
