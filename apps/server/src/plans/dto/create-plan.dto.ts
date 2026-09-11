import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min, MinLength, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TRAFFIC_RESET_MODES, TrafficResetMode } from '../../common/traffic-reset';

export const PLAN_MATCH_MODES = ['ALL', 'TAGS', 'EXPLICIT'] as const;
export type PlanMatchMode = (typeof PLAN_MATCH_MODES)[number];

export class PlanCardConfigDto {
  @ApiPropertyOptional({ enum: ['default', 'amber', 'blue', 'purple', 'emerald', 'rose', 'indigo'] })
  @IsString()
  @IsOptional()
  themeColor?: string;

  @ApiPropertyOptional({ example: 'Zap' })
  @IsString()
  @IsOptional()
  icon?: string;

  @ApiPropertyOptional({ example: '立即开通专线' })
  @IsString()
  @IsOptional()
  buttonText?: string;

  @ApiPropertyOptional({ example: 29.9, description: '划线原价，单位元' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  originalPrice?: number;

  @ApiPropertyOptional({ example: '立省 25%' })
  @IsString()
  @IsOptional()
  discountText?: string;

  @ApiPropertyOptional({ enum: ['default', 'outline', 'secondary', 'glow', 'gradient'] })
  @IsString()
  @IsOptional()
  badgeVariant?: string;

  @ApiPropertyOptional({ enum: ['none', 'beam', 'pulse', 'beam_pulse'] })
  @IsString()
  @IsOptional()
  animationEffect?: string;

  @ApiPropertyOptional({ enum: ['theme', 'rainbow'] })
  @IsString()
  @IsOptional()
  beamColor?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  shimmerButton?: boolean;
}

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

  @ApiPropertyOptional({ example: '热卖推荐' })
  @IsString()
  @IsOptional()
  badgeText?: string;

  @ApiPropertyOptional({ default: false, description: '是否作为主推套餐高亮展示' })
  @IsBoolean()
  @IsOptional()
  isFeatured?: boolean;

  @ApiPropertyOptional({ type: [String], example: ['解锁 4K 流媒体', '晚高峰专线保障'] })
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
