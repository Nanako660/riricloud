import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { MAX_EMAIL_LENGTH, normalizeEmail, PASSWORD_STRENGTH_MESSAGE, PASSWORD_STRENGTH_PATTERN } from '../../common/auth-security';

export class ResetPasswordDto {
  @ApiProperty({ example: 'user@example.com' })
  @Transform(({ value }) => typeof value === 'string' ? normalizeEmail(value) : value)
  @IsEmail()
  @MaxLength(MAX_EMAIL_LENGTH)
  email!: string;

  @ApiProperty({ example: '123456', description: '6 位邮箱验证码' })
  @IsString()
  @Matches(/^\d{6}$/, { message: '验证码必须为 6 位数字' })
  code!: string;

  @ApiProperty({ example: 'new-secure-password', description: '新密码' })
  @IsString()
  @MinLength(8, { message: '密码至少 8 位' })
  @MaxLength(64, { message: '密码最多 64 位' })
  @Matches(PASSWORD_STRENGTH_PATTERN, { message: PASSWORD_STRENGTH_MESSAGE })
  newPassword!: string;
}
