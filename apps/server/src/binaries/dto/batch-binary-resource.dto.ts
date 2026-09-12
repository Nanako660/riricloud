import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsString } from 'class-validator';

export const BINARY_BATCH_ACTIONS = ['activate', 'disable', 'retire', 'delete'] as const;
export type BinaryBatchAction = (typeof BINARY_BATCH_ACTIONS)[number];

export class BatchBinaryResourceDto {
  @ApiProperty({ enum: BINARY_BATCH_ACTIONS, description: '批量动作；delete 仅对无分发历史的非内置资源生效' })
  @IsIn(BINARY_BATCH_ACTIONS)
  action!: BinaryBatchAction;

  @ApiPropertyOptional({ type: [String], maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids!: string[];
}
