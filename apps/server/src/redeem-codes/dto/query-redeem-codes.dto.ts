import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const REDEEM_CODE_STATUSES = ['UNUSED', 'REDEEMED', 'REVOKED', 'EXPIRED'] as const;
export type RedeemCodeStatus = (typeof REDEEM_CODE_STATUSES)[number];

export class QueryRedeemCodesDto {
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

  @ApiPropertyOptional({ enum: REDEEM_CODE_STATUSES })
  @IsIn(REDEEM_CODE_STATUSES)
  @IsOptional()
  status?: RedeemCodeStatus;

  @ApiPropertyOptional({ description: '按卡密模糊搜索' })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  search?: string;
}
