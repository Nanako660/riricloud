import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min, MinLength, ValidateNested } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PLAN_MATCH_MODES, PlanMatchMode, PlanCardConfigDto } from './create-plan.dto';
import { TRAFFIC_RESET_MODES, TrafficResetMode } from '../../common/traffic-reset';

export class UpdatePlanDto {
  @ApiPropertyOptional()
  @IsString()
  @MinLength(1)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsString()
  @IsOptional()
  description?: string | null;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  @IsOptional()
  durationDays?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(1)
  @IsOptional()
  trafficLimitBytes?: number;

  @ApiPropertyOptional({ enum: TRAFFIC_RESET_MODES, description: '流量累计配额重置策略' })
  @IsIn(TRAFFIC_RESET_MODES)
  @IsOptional()
  trafficResetMode?: TrafficResetMode;

  @ApiPropertyOptional({ enum: PLAN_MATCH_MODES })
  @IsIn(PLAN_MATCH_MODES)
  @IsOptional()
  lineMatchMode?: PlanMatchMode;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  lineTags?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  lineIds?: string[];

  @ApiPropertyOptional({ nullable: true })
  @IsUUID()
  @IsOptional()
  templateId?: string | null;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @ApiPropertyOptional({ example: 1, nullable: true, description: '每位用户限购次数；null 表示不限购，最小为 1' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  purchaseLimitPerUser?: number | null;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  allowRenewal?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsString()
  @IsOptional()
  badgeText?: string | null;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isFeatured?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  features?: string[];

  @ApiPropertyOptional({ type: () => PlanCardConfigDto, description: '卡片视觉与营销包装配置' })
  @ValidateNested()
  @Type(() => PlanCardConfigDto)
  @IsOptional()
  cardConfig?: PlanCardConfigDto;
}
