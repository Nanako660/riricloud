import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULTS, SETTING_KEYS, SettingsService } from './settings.service';

describe('SettingsService', () => {
  let service: SettingsService;
  const prisma = {
    systemSetting: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
    $transaction: jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations))
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

  it('支持数字、布尔、数组与无效值回退', async () => {
    prisma.systemSetting.findMany.mockResolvedValue([
      { key: SETTING_KEYS.SITE_NAME, value: ' 我的面板 ' },
      { key: SETTING_KEYS.REGISTRATION_ENABLED, value: 'true' },
      { key: SETTING_KEYS.DEFAULT_TRAFFIC_LIMIT_BYTES, value: 'abc' },
      { key: SETTING_KEYS.EMAIL_DOMAIN_MODE, value: 'whitelist' },
      { key: SETTING_KEYS.EMAIL_DOMAIN_LIST, value: JSON.stringify(['@Example.COM', 'company.org']) },
      { key: SETTING_KEYS.PROBE_PRESET_TARGETS, value: JSON.stringify([{ type: 'tcp', target: 'example.com', port: 443 }]) },
      { key: SETTING_KEYS.CONFIG_SYNC_DEBOUNCE_MS, value: '-1' }
    ]);
    const settings = await service.getSettings();
    expect(settings.siteName).toBe('我的面板');
    expect(settings.registrationEnabled).toBe(true);
    expect(settings.defaultTrafficLimitBytes).toBe(DEFAULTS.defaultTrafficLimitBytes);
    expect(settings.emailDomainList).toEqual(['example.com', 'company.org']);
    expect(settings.probePresetTargets).toEqual([{ type: 'tcp', target: 'example.com', port: 443 }]);
    expect(settings.configSyncDebounceMs).toBe(DEFAULTS.configSyncDebounceMs);
  });

  it('部分更新对每个传入键执行事务 upsert 并返回全量', async () => {
    prisma.systemSetting.upsert.mockResolvedValue({});
    prisma.systemSetting.findMany.mockResolvedValue([
      { key: SETTING_KEYS.SITE_NAME, value: '新站名' },
      { key: SETTING_KEYS.REGISTRATION_ENABLED, value: 'false' },
      { key: SETTING_KEYS.DEFAULT_TRAFFIC_LIMIT_BYTES, value: '214748364800' }
    ]);
    const result = await service.updateSettings({ siteName: '新站名' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith({
      where: { key: SETTING_KEYS.SITE_NAME },
      update: { value: '新站名' },
      create: { key: SETTING_KEYS.SITE_NAME, value: '新站名', description: '站点名称' }
    });
    expect(result.defaultTrafficLimitBytes).toBe(214748364800);
  });

  it('公开设置严格过滤内部运维参数', async () => {
    prisma.systemSetting.findMany.mockResolvedValue([
      { key: SETTING_KEYS.SITE_NAME, value: '公开站点' },
      { key: SETTING_KEYS.JWT_SESSION_DAYS, value: '30' },
      { key: SETTING_KEYS.BINARY_DOWNLOAD_BASE_URL, value: 'https://internal.example.com' },
      { key: SETTING_KEYS.CUSTOM_CSS, value: 'body {}' }
    ]);
    await expect(service.getPublicSettings()).resolves.toEqual(expect.objectContaining({
      siteName: '公开站点',
      customCss: 'body {}'
    }));
    const result = await service.getPublicSettings();
    expect(result).not.toHaveProperty('jwtSessionDays');
    expect(result).not.toHaveProperty('binaryDownloadBaseUrl');
  });

  it('重置指定键时删除覆盖值并返回默认值', async () => {
    prisma.systemSetting.deleteMany.mockResolvedValue({ count: 2 });
    prisma.systemSetting.findMany.mockResolvedValue([]);
    const result = await service.resetToDefaults(['siteName', 'registrationEnabled']);
    expect(prisma.systemSetting.deleteMany).toHaveBeenCalledWith({ where: { key: { in: ['siteName', 'registrationEnabled'] } } });
    expect(result).toEqual(DEFAULTS);
  });
});
