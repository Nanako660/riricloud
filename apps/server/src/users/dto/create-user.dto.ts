import { Type } from 'class-transformer';
import { Transform } from 'class-transformer';
import { IsEmail, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ROLES, Role } from '../../common/constants';
import { MAX_EMAIL_LENGTH, normalizeEmail, PASSWORD_STRENGTH_MESSAGE, PASSWORD_STRENGTH_PATTERN } from '../../common/auth-security';

export class CreateUserDto {
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

  @ApiPropertyOptional({ enum: ROLES, default: 'USER' })
  @IsString()
  @IsOptional()
  role?: Role;

  @ApiPropertyOptional({ example: 107374182400, description: '字节；缺省取系统设置默认配额' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  trafficLimitBytes?: number;

  @ApiPropertyOptional({ example: '2027-01-01T00:00:00Z', nullable: true, description: 'ISO 日期；传 null 或缺省时按套餐/永久规则处理' })
  @IsString()
  @IsOptional()
  expireAt?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: '初始套餐；传 null 创建无套餐用户，缺省自动绑定体验套餐' })
  @IsUUID()
  @IsOptional()
  planId?: string | null;
}
