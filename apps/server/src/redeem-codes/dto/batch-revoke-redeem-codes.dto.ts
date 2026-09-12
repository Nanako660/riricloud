import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class BatchRevokeRedeemCodesDto {
  @ApiProperty({ type: [String], example: ['3f2504e0-4f89-41d3-9a0c-0305e82c3301'], description: '最多 500 张，仅未使用卡密会被作废' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  ids!: string[];
}
