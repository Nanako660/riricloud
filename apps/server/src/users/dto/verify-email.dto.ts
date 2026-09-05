import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({ example: '123456', description: '6 位邮箱验证码' })
  @IsString()
  @Matches(/^\d{6}$/, { message: '验证码必须为 6 位数字' })
  code!: string;
}
