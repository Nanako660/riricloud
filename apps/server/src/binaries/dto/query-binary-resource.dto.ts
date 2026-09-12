import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { BINARY_TARGET_PLATFORMS } from '../binary-targets';
import { BINARY_KINDS, BINARY_STATUSES } from './binary-resource.dto';

export class QueryBinaryResourceDto {
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

  @ApiPropertyOptional({ description: '按上游版本或备注模糊搜索' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: BINARY_KINDS })
  @IsIn(BINARY_KINDS)
  @IsOptional()
  kind?: (typeof BINARY_KINDS)[number];

  @ApiPropertyOptional({ enum: BINARY_STATUSES })
  @IsIn(BINARY_STATUSES)
  @IsOptional()
  status?: (typeof BINARY_STATUSES)[number];

  @ApiPropertyOptional({ enum: BINARY_TARGET_PLATFORMS, description: '按平台资产覆盖筛选，如 linux-amd64' })
  @IsIn(BINARY_TARGET_PLATFORMS)
  @IsOptional()
  platform?: (typeof BINARY_TARGET_PLATFORMS)[number];
}

export class QueryBinaryDeploymentDto {
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

  @ApiPropertyOptional({ enum: ['QUEUED', 'DISPATCHED', 'COMPLETED', 'FAILED'] })
  @IsIn(['QUEUED', 'DISPATCHED', 'COMPLETED', 'FAILED'])
  @IsOptional()
  status?: 'QUEUED' | 'DISPATCHED' | 'COMPLETED' | 'FAILED';
}

export class QueryBinaryAuditLogDto {
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

  @ApiPropertyOptional({ description: '按资源 ID 过滤' })
  @IsString()
  @IsOptional()
  releaseId?: string;

  @ApiPropertyOptional({ description: '按审计动作过滤' })
  @IsString()
  @IsOptional()
  action?: string;
}
