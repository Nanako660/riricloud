import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export const VERIFICATION_ACTIONS = ['REGISTER', 'CHANGE_EMAIL', 'VERIFY_CURRENT_EMAIL', 'RESET_PASSWORD'] as const;
export type VerificationAction = (typeof VERIFICATION_ACTIONS)[number];

export class SendCodeDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: VERIFICATION_ACTIONS })
  @IsIn(VERIFICATION_ACTIONS)
  action!: VerificationAction;

  @ApiPropertyOptional({ description: '本地 SVG 验证码的签名凭据' })
  @IsString()
  @MaxLength(4096)
  @IsOptional()
  captchaToken?: string;

  @ApiPropertyOptional({ description: '本地 SVG 验证码答案' })
  @IsString()
  @MaxLength(32)
  @IsOptional()
  captchaAnswer?: string;

  @ApiPropertyOptional({ description: 'Cloudflare Turnstile 返回的 token' })
  @IsString()
  @MaxLength(4096)
  @IsOptional()
  turnstileToken?: string;
}

export class VerifyCodeDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: VERIFICATION_ACTIONS })
  @IsIn(VERIFICATION_ACTIONS)
  action!: VerificationAction;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}
