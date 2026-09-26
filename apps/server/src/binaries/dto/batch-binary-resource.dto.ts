import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsString } from 'class-validator';

export const BINARY_BATCH_ACTIONS = ['activate', 'disable', 'retire', 'delete'] as const;
export type BinaryBatchAction = (typeof BINARY_BATCH_ACTIONS)[number];

export class BatchBinaryResourceDto {
  @ApiProperty({ enum: BINARY_BATCH_ACTIONS, description: '批量动作：activate / disable / retire / delete' })
  @IsIn(BINARY_BATCH_ACTIONS)
  action!: BinaryBatchAction;

  @ApiPropertyOptional({ type: [String], maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids!: string[];
}
