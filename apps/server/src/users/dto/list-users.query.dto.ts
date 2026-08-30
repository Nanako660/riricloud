import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ROLES, Role } from '../../common/constants';
import { SUBSCRIPTION_STATUSES } from '../../subscription/dto/admin-update-subscription.dto';

export class ListUsersQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  pageSize?: number = 20;

  @ApiPropertyOptional({ description: '邮箱模糊搜索' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: ROLES })
  @IsString()
  @IsOptional()
  role?: Role;

  @ApiPropertyOptional({ description: '按激活状态过滤' })
  @Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: SUBSCRIPTION_STATUSES, description: '按订阅生命周期状态过滤' })
  @IsIn(SUBSCRIPTION_STATUSES)
  @IsOptional()
  subscriptionStatus?: (typeof SUBSCRIPTION_STATUSES)[number];

  @ApiPropertyOptional({ format: 'uuid', description: '按当前套餐过滤' })
  @IsUUID()
  @IsOptional()
  planId?: string;
}
