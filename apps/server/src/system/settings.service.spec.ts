import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULTS, SETTING_KEYS, SettingsService } from './settings.service';

describe('SettingsService', () => {
  let service: SettingsService;
  type PrismaMock = {
    systemSetting: Record<string, jest.Mock>;
    subscriptionTemplate: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  const prisma: PrismaMock = {
    systemSetting: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
    subscriptionTemplate: { updateMany: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn(async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma))
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [SettingsService, { provide: PrismaService, useValue: prisma }]
    }).compile();
    service = moduleRef.get(SettingsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('空表时返回全量安全默认值', async () => {
    prisma.systemSetting.findMany.mockResolvedValue([]);
    await expect(service.getSettings()).resolves.toEqual(DEFAULTS);
  });

  it('支持数字、布尔、数组、时区与无效值回退', async () => {
    prisma.systemSetting.findMany.mockResolvedValue([
      { key: SETTING_KEYS.SITE_NAME, value: ' 我的面板 ' },
      { key: SETTING_KEYS.REGISTRATION_ENABLED, value: 'true' },
      { key: SETTING_KEYS.SUBSCRIPTION_SHORT_LINKS_ENABLED, value: '1' },
      { key: SETTING_KEYS.DEFAULT_BALANCE, value: '2500' },
      { key: SETTING_KEYS.EMAIL_DOMAIN_MODE, value: 'whitelist' },
      { key: SETTING_KEYS.EMAIL_DOMAIN_LIST, value: JSON.stringify(['@Example.COM', 'company.org']) },
      { key: SETTING_KEYS.PROBE_PRESET_TARGETS, value: JSON.stringify([{ type: 'tcp', target: 'example.com', port: 443 }]) },
      { key: SETTING_KEYS.CONFIG_SYNC_DEBOUNCE_MS, value: '-1' },
      { key: SETTING_KEYS.SYSTEM_TIMEZONE, value: 'America/New_York' }
    ]);
    const settings = await service.getSettings();
    expect(settings.siteName).toBe('我的面板');
    expect(settings.registrationEnabled).toBe(true);
    expect(settings.subscriptionShortLinksEnabled).toBe(true);
    expect(settings.defaultBalance).toBe(2500);
    expect(settings.emailDomainList).toEqual(['example.com', 'company.org']);
    expect(settings.probePresetTargets).toEqual([{ type: 'tcp', target: 'example.com', port: 443 }]);
    expect(settings.configSyncDebounceMs).toBe(DEFAULTS.configSyncDebounceMs);
    expect(settings.systemTimezone).toBe('America/New_York');
  });

  it('无效时区自动回退为默认时区', async () => {
    prisma.systemSetting.findMany.mockResolvedValue([
      { key: SETTING_KEYS.SYSTEM_TIMEZONE, value: 'Invalid/Timezone_Name' }
    ]);
    const settings = await service.getSettings();
    expect(settings.systemTimezone).toBe('Asia/Shanghai');
  });

  it('部分更新对每个传入键执行事务 upsert 并返回全量', async () => {
    prisma.systemSetting.upsert.mockResolvedValue({});
    prisma.systemSetting.findMany.mockResolvedValue([
      { key: SETTING_KEYS.SITE_NAME, value: '新站名' },
      { key: SETTING_KEYS.REGISTRATION_ENABLED, value: 'false' },
      { key: SETTING_KEYS.SYSTEM_TIMEZONE, value: 'UTC' }
    ]);
    const result = await service.updateSettings({ siteName: '新站名', systemTimezone: 'UTC' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith({
      where: { key: SETTING_KEYS.SITE_NAME },
      update: { value: '新站名' },
      create: { key: SETTING_KEYS.SITE_NAME, value: '新站名', description: '站点名称' }
    });
    expect(result.systemTimezone).toBe('UTC');
  });

  it('更新非法时区抛出 BadRequestException', async () => {
    await expect(service.updateSettings({ systemTimezone: 'Not/A_Real_Timezone' })).rejects.toThrow('无效的 IANA 时区标识符');
  });

  it('可保存 Nginx 短订阅链接开关', async () => {
    prisma.systemSetting.upsert.mockResolvedValue({});
    prisma.systemSetting.findMany.mockResolvedValue([]);
    await service.updateSettings({ subscriptionShortLinksEnabled: true });
    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith({
      where: { key: SETTING_KEYS.SUBSCRIPTION_SHORT_LINKS_ENABLED },
      update: { value: 'true' },
      create: {
        key: SETTING_KEYS.SUBSCRIPTION_SHORT_LINKS_ENABLED,
        value: 'true',
        description: '是否使用 Nginx 伪静态短订阅链接'
      }
    });
  });

  it('切换全局默认模板时同步模板默认标记', async () => {
    prisma.subscriptionTemplate.findUnique.mockResolvedValue({ id: 'template-1' });
    prisma.systemSetting.upsert.mockResolvedValue({});
    prisma.systemSetting.findMany.mockResolvedValue([]);
    await service.updateSettings({ defaultTemplateId: 'template-1' });
    expect(prisma.subscriptionTemplate.updateMany).toHaveBeenCalledWith({ data: { isDefault: false } });
    expect(prisma.subscriptionTemplate.update).toHaveBeenCalledWith({ where: { id: 'template-1' }, data: { isDefault: true } });
  });

  it('读取全站访问 URL 设置', async () => {
    prisma.systemSetting.findMany.mockResolvedValue([
      { key: SETTING_KEYS.PUBLIC_BASE_URL, value: ' https://panel.example.com/ ' }
    ]);
    await expect(service.getSettings()).resolves.toEqual(expect.objectContaining({
      publicBaseUrl: 'https://panel.example.com/'
    }));
  });

  it('公开设置包含时区与全站基准URL并严格过滤内部运维参数', async () => {
    prisma.systemSetting.findMany.mockResolvedValue([
      { key: SETTING_KEYS.SITE_NAME, value: '公开站点' },
      { key: SETTING_KEYS.PUBLIC_BASE_URL, value: 'https://panel.example.com' },
      { key: SETTING_KEYS.SYSTEM_TIMEZONE, value: 'Asia/Tokyo' },
      { key: SETTING_KEYS.JWT_SESSION_DAYS, value: '30' },
      { key: SETTING_KEYS.BINARY_DOWNLOAD_BASE_URL, value: 'https://internal.example.com' },
      { key: SETTING_KEYS.SUBSCRIPTION_SHORT_LINKS_ENABLED, value: 'true' },
      { key: SETTING_KEYS.CUSTOM_CSS, value: 'body {}' }
    ]);
    await expect(service.getPublicSettings()).resolves.toEqual(expect.objectContaining({
      siteName: '公开站点',
      publicBaseUrl: 'https://panel.example.com',
      systemTimezone: 'Asia/Tokyo',
      subscriptionShortLinksEnabled: true,
      customCss: 'body {}'
    }));
    const result = await service.getPublicSettings();
    expect(result).not.toHaveProperty('jwtSessionDays');
    expect(result).not.toHaveProperty('binaryDownloadBaseUrl');
  });

  it('重置指定键时删除覆盖值并返回默认值', async () => {
    prisma.systemSetting.deleteMany.mockResolvedValue({ count: 3 });
    prisma.systemSetting.findMany.mockResolvedValue([]);
    const result = await service.resetToDefaults(['siteName', 'registrationEnabled', 'subscriptionShortLinksEnabled']);
    expect(prisma.systemSetting.deleteMany).toHaveBeenCalledWith({ where: { key: { in: ['siteName', 'registrationEnabled', 'subscriptionShortLinksEnabled'] } } });
    expect(result).toEqual(DEFAULTS);
  });
});
