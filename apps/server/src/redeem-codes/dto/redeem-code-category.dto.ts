import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export const REDEEM_REWARD_TYPES = ['BALANCE', 'PLAN'] as const;

export class CreateRedeemCodeCategoryDto {
  @ApiProperty({ example: '新用户礼包' })
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ type: [String], example: ['活动', '新用户'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiProperty({ enum: REDEEM_REWARD_TYPES })
  @IsIn(REDEEM_REWARD_TYPES)
  rewardType!: (typeof REDEEM_REWARD_TYPES)[number];

  @ApiPropertyOptional({ description: '余额奖励金额，单位分；余额奖励必填' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  rewardAmount?: number;

  @ApiPropertyOptional({ description: '套餐奖励对应套餐 ID；套餐奖励必填' })
  @IsString()
  @IsOptional()
  planId?: string;

  @ApiPropertyOptional({ nullable: true, minimum: 1, description: '购买身份累计限额；null 表示不限，默认 1' })
  @Transform(({ value }) => value === null || value === undefined ? value : Number(value))
  @IsInt()
  @Min(1)
  @IsOptional()
  limitPerIdentity?: number | null;
}

export class UpdateRedeemCodeCategoryDto {
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(80)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ enum: REDEEM_REWARD_TYPES })
  @IsIn(REDEEM_REWARD_TYPES)
  @IsOptional()
  rewardType?: (typeof REDEEM_REWARD_TYPES)[number];

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  rewardAmount?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  planId?: string | null;

  @ApiPropertyOptional({ nullable: true, minimum: 1 })
  @Transform(({ value }) => value === null || value === undefined ? value : Number(value))
  @IsInt()
  @Min(1)
  @IsOptional()
  limitPerIdentity?: number | null;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
