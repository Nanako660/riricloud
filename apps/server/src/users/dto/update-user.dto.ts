import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ROLES, Role } from '../../common/constants';

// 部分更新：仅传入字段生效；expireAt 显式传 null 表示永久
export class UpdateUserDto {
  @ApiPropertyOptional({ enum: ROLES, description: '不允许修改自己的角色' })
  @IsString()
  @IsOptional()
  role?: Role;

  @ApiPropertyOptional({ example: 107374182400, description: '字节' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  trafficLimitBytes?: number;

  @ApiPropertyOptional({ example: '2027-01-01T00:00:00Z', description: 'ISO 日期；显式 null 表示永久' })
  @ValidateIf((o) => o.expireAt !== null)
  @IsDateString()
  @IsOptional()
  expireAt?: string | null;

  @ApiPropertyOptional({ example: 3, nullable: true, description: '同时在线设备数；null 跟随套餐，0 不限制，正数为用户覆盖' })
  @ValidateIf((o) => o.deviceLimit !== undefined && o.deviceLimit !== null)
  @IsInt()
  @Min(0)
  deviceLimit?: number | null;

  @ApiPropertyOptional({ description: '封禁=false / 解封=true' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ description: '管理端重置密码；长度 8-64，字符类别复杂度由系统设置动态决定', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  @IsOptional()
  password?: string;

  @ApiPropertyOptional({ description: '邮箱是否已验证；true=标记已验证，false=标记未验证' })
  @IsBoolean()
  @IsOptional()
  emailVerified?: boolean;
}
