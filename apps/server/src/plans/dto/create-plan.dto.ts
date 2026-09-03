import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TRAFFIC_RESET_MODES, TrafficResetMode } from '../../common/traffic-reset';

export const PLAN_MATCH_MODES = ['ALL', 'TAGS', 'EXPLICIT'] as const;
export type PlanMatchMode = (typeof PLAN_MATCH_MODES)[number];

export class CreatePlanDto {
  @ApiProperty({ example: '基础套餐' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ example: '适合日常使用' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 9.9, description: '价格，单位为元，最多两位小数；服务端按分存储' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiProperty({ example: 30 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  durationDays!: number;

  @ApiProperty({ example: 107374182400, description: '流量配额，单位字节' })
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(1)
  trafficLimitBytes!: number;

  @ApiPropertyOptional({ enum: TRAFFIC_RESET_MODES, default: 'NONE', description: '流量累计配额重置策略' })
  @IsIn(TRAFFIC_RESET_MODES)
  @IsOptional()
  trafficResetMode?: TrafficResetMode;

  @ApiPropertyOptional({ enum: PLAN_MATCH_MODES, default: 'ALL' })
  @IsIn(PLAN_MATCH_MODES)
  @IsOptional()
  lineMatchMode?: PlanMatchMode;

  @ApiPropertyOptional({ type: [String], example: ['vip', 'hk'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  lineTags?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  lineIds?: string[];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  templateId?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}
