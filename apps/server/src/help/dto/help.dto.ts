import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class QueryHelpArticlesDto {
  @ApiPropertyOptional({ description: '操作系统/分类平台过滤 (WINDOWS | MACOS | IOS | ANDROID | ROUTER | FAQ | GENERAL)' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({ description: '语言编码过滤 (如 zh-CN, en-US)' })
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiPropertyOptional({ description: '搜索关键词' })
  @IsOptional()
  @IsString()
  keyword?: string;
}

export class CreateHelpArticleDto {
  @ApiProperty({ description: '唯一 URL 标识 (仅限小写字母、数字与连字符)', example: 'windows-clash-verge' })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[a-z0-9-]+$/, { message: 'slug 必须为小写英文字母、数字或连字符' })
  slug!: string;

  @ApiProperty({ description: '文章标题', example: 'Windows 新手指南：Clash Verge Rev 安装与一键配置' })
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  title!: string;

  @ApiPropertyOptional({ description: '平台分类 (WINDOWS | MACOS | IOS | ANDROID | ROUTER | FAQ | GENERAL)', default: 'ALL' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({ description: '客户端名称 (如 Clash Verge Rev, Shadowrocket)' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientName?: string;

  @ApiPropertyOptional({ description: '图标标识 (如 Monitor, Laptop, Smartphone, HelpCircle)' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  icon?: string;

  @ApiPropertyOptional({ description: '文章简短摘要' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  summary?: string;

  @ApiProperty({ description: 'Markdown 正文内容' })
  @IsString()
  content!: string;

  @ApiPropertyOptional({ description: '排序权重，数值越小越靠前', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ description: '是否发布上架', default: true })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional({ description: '语言标识', default: 'zh-CN' })
  @IsOptional()
  @IsString()
  locale?: string;
}

export class UpdateHelpArticleDto {
  @ApiPropertyOptional({ description: '唯一 URL 标识' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[a-z0-9-]+$/, { message: 'slug 必须为小写英文字母、数字或连字符' })
  slug?: string;

  @ApiPropertyOptional({ description: '文章标题' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  title?: string;

  @ApiPropertyOptional({ description: '平台分类' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({ description: '客户端名称' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientName?: string;

  @ApiPropertyOptional({ description: '图标标识' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  icon?: string;

  @ApiPropertyOptional({ description: '文章简短摘要' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  summary?: string;

  @ApiPropertyOptional({ description: 'Markdown 正文内容' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ description: '排序权重' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ description: '是否发布上架' })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional({ description: '语言标识' })
  @IsOptional()
  @IsString()
  locale?: string;
}
