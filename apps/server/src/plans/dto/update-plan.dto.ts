import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PLAN_MATCH_MODES, PlanMatchMode } from './create-plan.dto';

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
  @IsInt()
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

  @ApiPropertyOptional({ enum: PLAN_MATCH_MODES })
  @IsIn(PLAN_MATCH_MODES)
  @IsOptional()
  nodeMatchMode?: PlanMatchMode;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  nodeTags?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  nodeIds?: string[];

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
}
