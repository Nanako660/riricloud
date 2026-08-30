import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubscribePlanDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  planId!: string;
}
