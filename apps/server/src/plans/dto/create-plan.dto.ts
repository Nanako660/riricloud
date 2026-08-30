import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

  @ApiPropertyOptional({ example: 990, description: '价格最小货币单位' })
  @Type(() => Number)
  @IsInt()
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

  @ApiPropertyOptional({ enum: PLAN_MATCH_MODES, default: 'ALL' })
  @IsIn(PLAN_MATCH_MODES)
  @IsOptional()
  nodeMatchMode?: PlanMatchMode;

  @ApiPropertyOptional({ type: [String], example: ['vip', 'hk'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  nodeTags?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  nodeIds?: string[];

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
