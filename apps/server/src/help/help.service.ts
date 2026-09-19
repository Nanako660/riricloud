import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../system/settings.service';
import { BUILTIN_HELP_ARTICLES } from './help-default-articles';
import { CreateHelpArticleDto, QueryHelpArticlesDto, UpdateHelpArticleDto } from './dto/help.dto';

export interface UserSubscriptionVariables {
  subUrl: string;
  clashImportUrl: string;
  shadowrocketImportUrl: string;
  singboxImportUrl: string;
  siteName: string;
}

@Injectable()
export class HelpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService
  ) {}

  /**
   * 用户端：获取已发布的帮助文档列表
   */
  async listPublished(query: QueryHelpArticlesDto) {
    const where: Record<string, unknown> = { isPublished: true };

    if (query.platform && query.platform !== 'ALL') {
      where.platform = query.platform.toUpperCase();
    }

    if (query.keyword?.trim()) {
      where.OR = [
        { title: { contains: query.keyword.trim() } },
        { summary: { contains: query.keyword.trim() } }
      ];
    }

    const requestedLocale = query.locale?.trim() || 'zh-CN';
    where.locale = requestedLocale;

    let articles = await this.prisma.helpArticle.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        slug: true,
        title: true,
        platform: true,
        clientName: true,
        icon: true,
        summary: true,
        sortOrder: true,
        locale: true,
        createdAt: true,
        updatedAt: true
      }
    });

    // 如果非中文语言没有查询到任何文章，平滑回退到中文
    if (articles.length === 0 && requestedLocale !== 'zh-CN') {
      where.locale = 'zh-CN';
      articles = await this.prisma.helpArticle.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          slug: true,
          title: true,
          platform: true,
          clientName: true,
          icon: true,
          summary: true,
          sortOrder: true,
          locale: true,
          createdAt: true,
          updatedAt: true
        }
      });
    }

    return articles;
  }

  /**
   * 用户端：获取单篇帮助文档详情，并自动完成专属动态变量注入
   */
  async getPublishedArticle(idOrSlug: string, userId?: string) {
    const article = await this.prisma.helpArticle.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
        isPublished: true
      }
    });

    if (!article) {
      throw new NotFoundException('帮助文档不存在或已下架');
    }

    const variables = await this.resolveUserVariables(userId);
    const interpolatedContent = this.interpolateContent(article.content, variables);

    return {
      ...article,
      content: interpolatedContent,
      variables
    };
  }

  /**
   * 管理端：获取所有文档（含未发布草稿）
   */
  async listAllForAdmin(query: QueryHelpArticlesDto) {
    const where: Record<string, unknown> = {};

    if (query.platform && query.platform !== 'ALL') {
      where.platform = query.platform.toUpperCase();
    }

    if (query.locale?.trim()) {
      where.locale = query.locale.trim();
    }

    if (query.keyword?.trim()) {
      where.OR = [
        { title: { contains: query.keyword.trim() } },
        { slug: { contains: query.keyword.trim() } },
        { summary: { contains: query.keyword.trim() } }
      ];
    }

    return this.prisma.helpArticle.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }]
    });
  }

  /**
   * 管理端：根据 ID 获取单篇文档
   */
  async getForAdmin(id: string) {
    const article = await this.prisma.helpArticle.findUnique({ where: { id } });
    if (!article) {
      throw new NotFoundException('文档不存在');
    }
    return article;
  }

  /**
   * 管理端：新建文档
   */
  async create(dto: CreateHelpArticleDto) {
    const existing = await this.prisma.helpArticle.findUnique({ where: { slug: dto.slug } });
    if (existing) {
      throw new BadRequestException(`Slug '${dto.slug}' 已被占用，请使用其他标识`);
    }

    return this.prisma.helpArticle.create({
      data: {
        slug: dto.slug,
        title: dto.title,
        platform: (dto.platform || 'ALL').toUpperCase(),
        clientName: dto.clientName?.trim() || null,
        icon: dto.icon?.trim() || null,
        summary: dto.summary?.trim() || null,
        content: dto.content,
        sortOrder: dto.sortOrder ?? 0,
        isPublished: dto.isPublished ?? true,
        locale: dto.locale?.trim() || 'zh-CN'
      }
    });
  }

  /**
   * 管理端：更新文档
   */
  async update(id: string, dto: UpdateHelpArticleDto) {
    const existing = await this.prisma.helpArticle.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('文档不存在');
    }

    if (dto.slug && dto.slug !== existing.slug) {
      const slugConflict = await this.prisma.helpArticle.findUnique({ where: { slug: dto.slug } });
      if (slugConflict) {
        throw new BadRequestException(`Slug '${dto.slug}' 已被占用`);
      }
    }

    return this.prisma.helpArticle.update({
      where: { id },
      data: {
        ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.platform !== undefined ? { platform: dto.platform.toUpperCase() } : {}),
        ...(dto.clientName !== undefined ? { clientName: dto.clientName.trim() || null } : {}),
        ...(dto.icon !== undefined ? { icon: dto.icon.trim() || null } : {}),
        ...(dto.summary !== undefined ? { summary: dto.summary.trim() || null } : {}),
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isPublished !== undefined ? { isPublished: dto.isPublished } : {}),
        ...(dto.locale !== undefined ? { locale: dto.locale.trim() || 'zh-CN' } : {})
      }
    });
  }

  /**
   * 管理端：删除文档
   */
  async remove(id: string) {
    const existing = await this.prisma.helpArticle.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('文档不存在');
    }

    await this.prisma.helpArticle.delete({ where: { id } });
    return { success: true, message: '文档已删除' };
  }

  /**
   * 管理端：一键重置为系统出厂预设教程
   */
  async resetDefaults() {
    for (const preset of BUILTIN_HELP_ARTICLES) {
      await this.prisma.helpArticle.upsert({
        where: { slug: preset.slug },
        update: {
          title: preset.title,
          platform: preset.platform,
          clientName: preset.clientName,
          icon: preset.icon,
          summary: preset.summary,
          content: preset.content,
          sortOrder: preset.sortOrder,
          isPublished: preset.isPublished,
          locale: preset.locale
        },
        create: {
          slug: preset.slug,
          title: preset.title,
          platform: preset.platform,
          clientName: preset.clientName,
          icon: preset.icon,
          summary: preset.summary,
          content: preset.content,
          sortOrder: preset.sortOrder,
          isPublished: preset.isPublished,
          locale: preset.locale
        }
      });
    }

    return {
      success: true,
      count: BUILTIN_HELP_ARTICLES.length,
      message: '已成功将官方新手教程恢复为出厂预设'
    };
  }

  /**
   * 计算当前用户的专属订阅链接与变量映射
   */
  private async resolveUserVariables(userId?: string): Promise<UserSubscriptionVariables> {
    const settings = await this.settingsService.getSettings();
    const siteName = settings.siteName || 'RiriCloud';
    const baseUrl = (settings.subscriptionBaseUrl || settings.publicBaseUrl || '').replace(/\/+$/, '');

    let token = '';
    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { subscriptionToken: true }
      });
      if (user?.subscriptionToken) {
        token = user.subscriptionToken;
      }
    }

    const subUrl = token
      ? (baseUrl ? `${baseUrl}/sub/${token}` : `/sub/${token}`)
      : 'https://example.com/sub/demo-token';

    const clashImportUrl = encodeURIComponent(subUrl);
    const shadowrocketImportUrl = Buffer.from(subUrl).toString('base64');
    const singboxImportUrl = encodeURIComponent(subUrl);

    return {
      subUrl,
      clashImportUrl,
      shadowrocketImportUrl,
      singboxImportUrl,
      siteName
    };
  }

  /**
   * 动态替换 Markdown 中的占位符
   */
  private interpolateContent(content: string, vars: UserSubscriptionVariables): string {
    return content
      .replace(/\{\{subscription_url\}\}/g, vars.subUrl)
      .replace(/\{\{clash_import_url\}\}/g, vars.clashImportUrl)
      .replace(/\{\{shadowrocket_import_url\}\}/g, vars.shadowrocketImportUrl)
      .replace(/\{\{singbox_import_url\}\}/g, vars.singboxImportUrl)
      .replace(/\{\{site_name\}\}/g, vars.siteName);
  }
}
