import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpgradeSubscriptionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  planId!: string;
}
