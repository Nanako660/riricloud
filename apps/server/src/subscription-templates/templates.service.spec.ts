import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { TemplatesService } from './templates.service';

describe('TemplatesService', () => {
  let service: TemplatesService;
  const prisma = {
    subscriptionTemplate: {
      create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn(), delete: jest.fn()
    }
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TemplatesService, { provide: PrismaService, useValue: prisma }]
    }).compile();
    service = moduleRef.get(TemplatesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('拒绝非法的 JSON 覆写', async () => {
    await expect(service.create({ name: 'bad', customInjectJson: '{', isDefault: false })).rejects.toThrow(BadRequestException);
    expect(prisma.subscriptionTemplate.create).not.toHaveBeenCalled();
  });

  it('设置默认模板时清理旧默认标记', async () => {
    prisma.subscriptionTemplate.create.mockResolvedValue({
      id: 't1', name: 'new', description: null, isDefault: true, proxyGroupsJson: '[]', ruleSetsJson: '[]', dnsConfigJson: '{}', customInjectYaml: null, customInjectJson: null
    });
    await service.create({ name: 'new', isDefault: true });
    expect(prisma.subscriptionTemplate.updateMany).toHaveBeenCalledWith({ data: { isDefault: false } });
  });

  it('默认模板不能删除', async () => {
    prisma.subscriptionTemplate.findUnique.mockResolvedValue({ isDefault: true, _count: { plans: 0 } });
    await expect(service.remove('t1')).rejects.toThrow(ConflictException);
  });
});
