import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '123456', description: '6 位邮箱验证码' })
  @IsString()
  @Matches(/^\d{6}$/, { message: '验证码必须为 6 位数字' })
  code!: string;

  @ApiProperty({ example: 'new-secure-password', description: '新密码' })
  @IsString()
  @MinLength(8, { message: '密码至少 8 位' })
  @MaxLength(64, { message: '密码最多 64 位' })
  newPassword!: string;
}
