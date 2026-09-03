import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsUUID, Min, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const SUBSCRIPTION_STATUSES = ['ACTIVE', 'CANCELED', 'EXPIRED', 'REVOKED'] as const;

export class AdminUpdateSubDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: '传 null 删除订阅并回到无套餐状态' })
  @IsUUID()
  @IsOptional()
  planId?: string | null;

  @ApiPropertyOptional({ enum: SUBSCRIPTION_STATUSES })
  @IsIn(SUBSCRIPTION_STATUSES)
  @IsOptional()
  status?: (typeof SUBSCRIPTION_STATUSES)[number];

  @ApiPropertyOptional({ description: '新的配额，单位字节' })
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(1)
  @IsOptional()
  trafficLimitBytes?: number;

  @ApiPropertyOptional({ description: '手动设置已用流量，单位字节' })
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @IsOptional()
  trafficUsedBytes?: number;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((value) => value.expireAt !== null)
  @IsDateString()
  @IsOptional()
  expireAt?: string | null;

  @ApiPropertyOptional({ description: '在当前到期时间上增加天数' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  addDays?: number;

  @ApiPropertyOptional({ type: [String], description: '用户额外线路授权，传入完整列表；空数组清空授权' })
  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  extraLineIds?: string[];
}
