import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SETTING_KEYS, SettingsService } from './settings.service';

describe('SettingsService', () => {
  let service: SettingsService;
  const prisma = {
    systemSetting: { findMany: jest.fn(), upsert: jest.fn() }
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [SettingsService, { provide: PrismaService, useValue: prisma }]
    }).compile();
    service = moduleRef.get(SettingsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('空表时返回默认值', async () => {
    prisma.systemSetting.findMany.mockResolvedValue([]);
    const settings = await service.getSettings();
    expect(settings).toEqual({
      siteName: 'RiriCloud',
      registrationEnabled: false,
      defaultTrafficLimitBytes: 107374182400
    });
  });

  it('已存键覆盖默认值，非法值回退默认', async () => {
    prisma.systemSetting.findMany.mockResolvedValue([
      { key: SETTING_KEYS.SITE_NAME, value: '我的面板' },
      { key: SETTING_KEYS.REGISTRATION_ENABLED, value: 'true' },
      { key: SETTING_KEYS.DEFAULT_TRAFFIC_LIMIT_BYTES, value: 'abc' }
    ]);
    const settings = await service.getSettings();
    expect(settings.siteName).toBe('我的面板');
    expect(settings.registrationEnabled).toBe(true);
    expect(settings.defaultTrafficLimitBytes).toBe(107374182400);
  });

  it('部分更新对每个传入键执行 upsert 并返回全量', async () => {
    prisma.systemSetting.upsert.mockResolvedValue({});
    prisma.systemSetting.findMany.mockResolvedValue([
      { key: SETTING_KEYS.SITE_NAME, value: '新站名' },
      { key: SETTING_KEYS.REGISTRATION_ENABLED, value: 'false' },
      { key: SETTING_KEYS.DEFAULT_TRAFFIC_LIMIT_BYTES, value: '214748364800' }
    ]);
    const result = await service.updateSettings({ siteName: '新站名' });
    expect(prisma.systemSetting.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith({
      where: { key: SETTING_KEYS.SITE_NAME },
      update: { value: '新站名' },
      create: { key: SETTING_KEYS.SITE_NAME, value: '新站名', description: '站点名称' }
    });
    expect(result.defaultTrafficLimitBytes).toBe(214748364800);
  });
});
