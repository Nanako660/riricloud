import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ minLength: 8, maxLength: 64 })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  oldPassword!: string;

  @ApiProperty({ minLength: 8, maxLength: 64, description: '字符类别复杂度由系统设置动态决定' })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  newPassword!: string;
}
