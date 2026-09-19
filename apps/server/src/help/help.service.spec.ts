import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../system/settings.service';
import { HelpService } from './help.service';

describe('HelpService', () => {
  let service: HelpService;

  const mockPrisma = {
    helpArticle: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn()
    },
    user: {
      findUnique: jest.fn()
    }
  };

  const mockSettingsService = {
    getSettings: jest.fn().mockResolvedValue({
      siteName: 'RiriTestSite',
      publicBaseUrl: 'https://riri.test',
      subscriptionBaseUrl: 'https://sub.riri.test'
    })
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HelpService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: mockSettingsService }
      ]
    }).compile();

    service = module.get<HelpService>(HelpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listPublished', () => {
    it('should query published articles with locale and platform', async () => {
      mockPrisma.helpArticle.findMany.mockResolvedValueOnce([
        { id: '1', slug: 'win-guide', title: 'Win Guide', platform: 'WINDOWS' }
      ]);

      const result = await service.listPublished({ platform: 'WINDOWS', locale: 'zh-CN' });
      expect(result).toHaveLength(1);
      expect(mockPrisma.helpArticle.findMany).toHaveBeenCalledWith({
        where: { isPublished: true, platform: 'WINDOWS', locale: 'zh-CN' },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: expect.any(Object)
      });
    });

    it('should fallback to zh-CN if non-zh locale has no articles', async () => {
      mockPrisma.helpArticle.findMany
        .mockResolvedValueOnce([]) // en-US returns empty
        .mockResolvedValueOnce([{ id: '1', slug: 'win-guide', title: 'Win Guide' }]); // zh-CN returns 1

      const result = await service.listPublished({ locale: 'en-US' });
      expect(result).toHaveLength(1);
      expect(mockPrisma.helpArticle.findMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('getPublishedArticle', () => {
    it('should throw NotFoundException when article not found', async () => {
      mockPrisma.helpArticle.findFirst.mockResolvedValueOnce(null);
      await expect(service.getPublishedArticle('not-exist')).rejects.toThrow(NotFoundException);
    });

    it('should interpolate dynamic subscription tokens for authenticated user', async () => {
      mockPrisma.helpArticle.findFirst.mockResolvedValueOnce({
        id: '1',
        slug: 'win-guide',
        title: 'Win Guide',
        content: '订阅地址: {{subscription_url}}, 站点: {{site_name}}',
        isPublished: true
      });
      mockPrisma.user.findUnique.mockResolvedValueOnce({ subscriptionToken: 'user-token-123' });

      const result = await service.getPublishedArticle('win-guide', 'user-1');
      expect(result.content).toContain('订阅地址: https://sub.riri.test/sub/user-token-123');
      expect(result.content).toContain('站点: RiriTestSite');
      expect(result.variables.subUrl).toBe('https://sub.riri.test/sub/user-token-123');
    });
  });

  describe('create', () => {
    it('should throw BadRequestException if slug already exists', async () => {
      mockPrisma.helpArticle.findUnique.mockResolvedValueOnce({ id: 'existing-id' });

      await expect(
        service.create({
          slug: 'win-guide',
          title: 'Windows Guide',
          content: 'Content'
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('should create article with default values', async () => {
      mockPrisma.helpArticle.findUnique.mockResolvedValueOnce(null);
      mockPrisma.helpArticle.create.mockResolvedValueOnce({ id: 'new-id', slug: 'win-guide' });

      const result = await service.create({
        slug: 'win-guide',
        title: 'Windows Guide',
        content: 'Content'
      });

      expect(result.id).toBe('new-id');
      expect(mockPrisma.helpArticle.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          slug: 'win-guide',
          title: 'Windows Guide',
          platform: 'ALL',
          isPublished: true,
          locale: 'zh-CN'
        })
      });
    });
  });

  describe('resetDefaults', () => {
    it('should upsert all default articles', async () => {
      mockPrisma.helpArticle.upsert.mockResolvedValue({});
      const result = await service.resetDefaults();
      expect(result.success).toBe(true);
      expect(result.count).toBeGreaterThan(0);
      expect(mockPrisma.helpArticle.upsert).toHaveBeenCalled();
    });
  });
});
