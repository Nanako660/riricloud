import { IsArray, IsIn, IsUUID, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { LINE_STATUSES, LineStatus } from '../../common/constants';

export class BatchLineStatusDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  ids!: string[];

  @ApiProperty({ enum: LINE_STATUSES })
  @IsIn(LINE_STATUSES)
  status!: LineStatus;
}
