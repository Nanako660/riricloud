import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BatchRedeemCodesDto {
  @ApiProperty({ example: 10, minimum: 1, maximum: 1000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  count!: number;

  @ApiPropertyOptional({ example: 50, description: '兼容历史接口；单位为分。新管理端按分类奖励自动确定' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  @IsOptional()
  amount?: number;

  @ApiPropertyOptional({ description: '卡密分类 ID；省略时使用不限额历史分类以兼容旧客户端' })
  @IsString()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ example: 'RIRI', description: '仅允许大写字母、数字和短横线' })
  @IsString()
  @MaxLength(16)
  @Matches(/^[A-Za-z0-9-]*$/)
  @IsOptional()
  prefix?: string;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59Z', nullable: true })
  @IsDateString()
  @IsOptional()
  expiresAt?: string | null;

  @ApiPropertyOptional({ example: '活动充值卡' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  note?: string;
}
