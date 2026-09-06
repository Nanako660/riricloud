import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MAX_EMAIL_LENGTH, normalizeEmail, PASSWORD_STRENGTH_MESSAGE, PASSWORD_STRENGTH_PATTERN } from '../../common/auth-security';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @Transform(({ value }) => typeof value === 'string' ? normalizeEmail(value) : value)
  @IsEmail()
  @MaxLength(MAX_EMAIL_LENGTH)
  email!: string;

  @ApiProperty({ example: 'Strong-password1!', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  @Matches(PASSWORD_STRENGTH_PATTERN, { message: PASSWORD_STRENGTH_MESSAGE })
  password!: string;

  @ApiPropertyOptional({ example: '小云', minLength: 2, maxLength: 20 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value)
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  @IsOptional()
  nickname?: string;

  @ApiPropertyOptional({ example: '123456', description: '启用注册邮箱验证时必填' })
  @IsString()
  @Matches(/^\d{6}$/)
  @IsOptional()
  verificationCode?: string;

  @ApiPropertyOptional({ description: '本地 SVG 验证码签名凭据' })
  @IsString()
  @MaxLength(4096)
  @IsOptional()
  captchaToken?: string;

  @ApiPropertyOptional({ description: '本地 SVG 验证码答案' })
  @IsString()
  @MaxLength(32)
  @IsOptional()
  captchaAnswer?: string;

  @ApiPropertyOptional({ description: 'Cloudflare Turnstile token' })
  @IsString()
  @MaxLength(4096)
  @IsOptional()
  turnstileToken?: string;
}
