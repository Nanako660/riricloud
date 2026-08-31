import { Type } from 'class-transformer';
import { IsArray, IsInt, IsUUID, Min, ValidateNested, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LineOrderItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;

  @ApiProperty({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class ReorderLinesDto {
  @ApiProperty({ type: [LineOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineOrderItemDto)
  items!: LineOrderItemDto[];
}
