import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SUBSCRIPTION_STATUSES } from './admin-update-subscription.dto';

export class QuerySubscriptionDto {
  @ApiPropertyOptional({ default: 1 })
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

  @ApiPropertyOptional({ description: '按邮箱模糊搜索' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: SUBSCRIPTION_STATUSES })
  @IsIn(SUBSCRIPTION_STATUSES)
  @IsOptional()
  status?: (typeof SUBSCRIPTION_STATUSES)[number];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  planId?: string;
}
