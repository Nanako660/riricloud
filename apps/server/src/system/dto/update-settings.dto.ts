
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DEFAULTS, SETTING_KEYS } from '../settings.service';

export class ProbePresetTargetDto {
  @ApiProperty({ enum: ['tcp', 'dns', 'icmp'] })
  @IsIn(['tcp', 'dns', 'icmp'])
  type!: 'tcp' | 'dns' | 'icmp';

  @ApiProperty({ example: 'www.apple.com' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  target!: string;

  @ApiPropertyOptional({ example: 443 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  port?: number;

  @ApiPropertyOptional({ example: 5000 })
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(60000)
  @IsOptional()
  timeoutMs?: number;
}

export class UpdateSettingsDto {
  @ApiPropertyOptional({ example: '我的面板' })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  @IsOptional()
  siteName?: string;

  @ApiPropertyOptional({ example: '多节点代理管理面板' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  siteDescription?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/logo.svg', nullable: true })
  @ValidateIf((o) => o.logoUrl !== undefined && o.logoUrl !== null && o.logoUrl !== '')
  @IsUrl({ require_protocol: true })
  @IsOptional()
  logoUrl?: string | null;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/favicon.ico', nullable: true })
  @ValidateIf((o) => o.faviconUrl !== undefined && o.faviconUrl !== null && o.faviconUrl !== '')
  @IsUrl({ require_protocol: true })
  @IsOptional()
  faviconUrl?: string | null;

  @ApiPropertyOptional({ example: '**维护公告**：今晚 23:00 进行节点升级' })
  @IsString()
  @MaxLength(10000)
  @IsOptional()
  siteAnnouncement?: string;

  @ApiPropertyOptional({ example: '© 2026 RiriCloud', nullable: true })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  footerCopyright?: string | null;

  @ApiPropertyOptional({ example: 'https://t.me/riricloud', nullable: true })
  @ValidateIf((o) => o.supportTelegramUrl !== undefined && o.supportTelegramUrl !== null && o.supportTelegramUrl !== '')
  @IsUrl({ require_protocol: true })
  @IsOptional()
  supportTelegramUrl?: string | null;

  @ApiPropertyOptional({ example: 'https://discord.gg/example', nullable: true })
  @ValidateIf((o) => o.supportDiscordUrl !== undefined && o.supportDiscordUrl !== null && o.supportDiscordUrl !== '')
  @IsUrl({ require_protocol: true })
  @IsOptional()
  supportDiscordUrl?: string | null;

  @ApiPropertyOptional({ example: 'support@example.com', nullable: true })
  @ValidateIf((o) => o.supportEmail !== undefined && o.supportEmail !== null && o.supportEmail !== '')
  @IsEmail()
  @IsOptional()
  supportEmail?: string | null;

  @ApiPropertyOptional({ example: 'https://example.com/support', nullable: true })
  @ValidateIf((o) => o.supportCustomUrl !== undefined && o.supportCustomUrl !== null && o.supportCustomUrl !== '')
  @IsUrl({ require_protocol: true })
  @IsOptional()
  supportCustomUrl?: string | null;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  registrationEnabled?: boolean;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @ValidateIf((o) => o.defaultPlanId !== undefined && o.defaultPlanId !== null && o.defaultPlanId !== '')
  @IsUUID()
  @IsOptional()
  defaultPlanId?: string | null;

  @ApiPropertyOptional({ example: 107374182400, description: '字节；必须大于 0' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  defaultTrafficLimitBytes?: number;

  @ApiPropertyOptional({ example: 30, description: '0 表示永久有效' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  @IsOptional()
  defaultValidityDays?: number;

  @ApiPropertyOptional({ enum: ['none', 'whitelist', 'blacklist'], default: 'none' })
  @IsIn(['none', 'whitelist', 'blacklist'])
  @IsOptional()
  emailDomainMode?: 'none' | 'whitelist' | 'blacklist';

  @ApiPropertyOptional({ type: [String], example: ['example.com', 'company.org'] })
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  @IsOptional()
  emailDomainList?: string[];

  @ApiPropertyOptional({ example: 10, minimum: 8, maximum: 64 })
  @Type(() => Number)
  @IsInt()
  @Min(8)
  @Max(64)
  @IsOptional()
  passwordMinLength?: number;

  @ApiPropertyOptional({ example: 'https://panel.example.com', nullable: true })
  @ValidateIf((o) => o.subscriptionBaseUrl !== undefined && o.subscriptionBaseUrl !== null && o.subscriptionBaseUrl !== '')
  @IsUrl({ require_protocol: true })
  @IsOptional()
  subscriptionBaseUrl?: string | null;

  @ApiPropertyOptional({ example: 24, minimum: 1, maximum: 168 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(168)
  @IsOptional()
  subscriptionUpdateIntervalHours?: number;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @ValidateIf((o) => o.defaultTemplateId !== undefined && o.defaultTemplateId !== null && o.defaultTemplateId !== '')
  @IsUUID()
  @IsOptional()
  defaultTemplateId?: string | null;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  publicLinesEnabled?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  includeUsageHeaders?: boolean;

  @ApiPropertyOptional({ example: 15, minimum: 5, maximum: 3600 })
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(3600)
  @IsOptional()
  heartbeatTimeoutSecs?: number;

  @ApiPropertyOptional({ example: 250, minimum: 0, maximum: 10000 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  @IsOptional()
  configSyncDebounceMs?: number;

  @ApiPropertyOptional({ example: 15, minimum: 5, maximum: 300 })
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(300)
  @IsOptional()
  defaultPollIntervalSecs?: number;

  @ApiPropertyOptional({ example: 'https://downloads.example.com/riricloud', nullable: true })
  @ValidateIf((o) => o.binaryDownloadBaseUrl !== undefined && o.binaryDownloadBaseUrl !== null && o.binaryDownloadBaseUrl !== '')
  @IsUrl({ require_protocol: true })
  @IsOptional()
  binaryDownloadBaseUrl?: string | null;

  @ApiPropertyOptional({ type: [ProbePresetTargetDto] })
  @IsArray()
  @ArrayMaxSize(32)
  @ValidateNested({ each: true })
  @Type(() => ProbePresetTargetDto)
  @IsOptional()
  probePresetTargets?: ProbePresetTargetDto[];

  @ApiPropertyOptional({ example: 1, minimum: 1, maximum: 30 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  @IsOptional()
  jwtSessionDays?: number;

  @ApiPropertyOptional({ example: ':root { --primary: 220 80% 50%; }' })
  @IsString()
  @MaxLength(50000)
  @IsOptional()
  customCss?: string;

  @ApiPropertyOptional({ example: '<script>window.supported = true;</script>' })
  @IsString()
  @MaxLength(20000)
  @IsOptional()
  customHeadHtml?: string;
}

export class ResetSettingsDto {
  @ApiPropertyOptional({ enum: Object.keys(DEFAULTS), isArray: true, description: '省略时重置全部设置' })
  @IsArray()
  @ArrayMaxSize(Object.keys(SETTING_KEYS).length)
  @IsIn(Object.keys(DEFAULTS), { each: true })
  @IsOptional()
  keys?: Array<keyof typeof DEFAULTS>;
}
