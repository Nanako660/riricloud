import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class AdjustBalanceDto {
  @ApiProperty({ example: 500, description: '带符号金额，单位为分；正数充值，负数扣减' })
  @Type(() => Number)
  @IsInt()
  @Min(-2147483647)
  @Max(2147483647)
  amount!: number;

  @ApiPropertyOptional({ example: '活动补发' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  description?: string;
}
