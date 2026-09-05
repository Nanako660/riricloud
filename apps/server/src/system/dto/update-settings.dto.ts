
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

  @ApiPropertyOptional({ example: '欢迎使用本服务' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  siteDescription?: string;

  @ApiPropertyOptional({ example: 'https://panel.example.com', nullable: true, description: '用于生成 Agent 安装、升级和二进制下载地址；留空时自动匹配当前访问域名' })
  @ValidateIf((o) => o.publicBaseUrl !== undefined && o.publicBaseUrl !== null && o.publicBaseUrl !== '')
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @IsOptional()
  publicBaseUrl?: string | null;

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

  @ApiPropertyOptional({ example: 1000, description: '新用户注册初始余额，单位为分' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  defaultBalance?: number;

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

  @ApiPropertyOptional({ example: false, description: '开启后用户端生成由 Nginx rewrite 到 /api/v1/sub/:token 的短链接' })
  @IsBoolean()
  @IsOptional()
  subscriptionShortLinksEnabled?: boolean;

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

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  lineSpeedtestEnabled?: boolean;

  @ApiPropertyOptional({ example: 30, minimum: 1, maximum: 1440 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  @IsOptional()
  lineSpeedtestIntervalMins?: number;

  @ApiPropertyOptional({ example: 'http://cp.cloudflare.com/generate_204' })
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @IsOptional()
  lineSpeedtestTargetUrl?: string;

  @ApiPropertyOptional({ example: 3000, minimum: 500, maximum: 30000 })
  @Type(() => Number)
  @IsInt()
  @Min(500)
  @Max(30000)
  @IsOptional()
  lineSpeedtestTimeoutMs?: number;

  @ApiPropertyOptional({ example: 'Asia/Shanghai', description: '系统统一时区，标准 IANA 时区标识符' })
  @IsString()
  @IsOptional()
  systemTimezone?: string;

  @ApiPropertyOptional({ example: false, description: '是否启用 SMTP 发信服务' })
  @IsBoolean()
  @IsOptional()
  smtpEnabled?: boolean;

  @ApiPropertyOptional({ example: 'smtp.example.com' })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  smtpHost?: string;

  @ApiPropertyOptional({ example: 587, minimum: 1, maximum: 65535 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  smtpPort?: number;

  @ApiPropertyOptional({ example: true, description: '465 端口通常使用 SSL/TLS；587 通常使用 STARTTLS' })
  @IsBoolean()
  @IsOptional()
  smtpSecure?: boolean;

  @ApiPropertyOptional({ example: 'noreply@example.com' })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  smtpUser?: string;

  @ApiPropertyOptional({ example: '留空表示保留当前密码', writeOnly: true })
  @IsString()
  @MaxLength(512)
  @IsOptional()
  smtpPass?: string;

  @ApiPropertyOptional({ example: 'RiriCloud <noreply@example.com>' })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  smtpFrom?: string;

  @ApiPropertyOptional({ example: true, description: '注册时必须验证邮箱验证码' })
  @IsBoolean()
  @IsOptional()
  emailVerificationEnabled?: boolean;

  @ApiPropertyOptional({ enum: ['OFF', 'LOCAL', 'TURNSTILE'], default: 'OFF' })
  @IsIn(['OFF', 'LOCAL', 'TURNSTILE'])
  @IsOptional()
  captchaMode?: 'OFF' | 'LOCAL' | 'TURNSTILE';

  @ApiPropertyOptional({ example: '0x4AAAAAAA...' })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  turnstileSiteKey?: string;

  @ApiPropertyOptional({ example: '0x4AAAAAAA...', writeOnly: true })
  @IsString()
  @MaxLength(512)
  @IsOptional()
  turnstileSecretKey?: string;
}

export class ResetSettingsDto {
  @ApiPropertyOptional({ enum: Object.keys(DEFAULTS), isArray: true, description: '省略时重置全部设置' })
  @IsArray()
  @ArrayMaxSize(Object.keys(SETTING_KEYS).length)
  @IsIn(Object.keys(DEFAULTS), { each: true })
  @IsOptional()
  keys?: Array<keyof typeof DEFAULTS>;
}
