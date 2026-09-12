import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class CleanupRedeemCodesDto {
  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 3650, description: '清理已过期超过 N 天且未使用的卡密' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  @IsOptional()
  retentionDays?: number = 30;
}
