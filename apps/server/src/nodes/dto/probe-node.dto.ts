import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsIn, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ProbeItemDto {
  @ApiProperty({ enum: ['tcp', 'dns', 'icmp'] })
  @IsIn(['tcp', 'dns', 'icmp'])
  type!: 'tcp' | 'dns' | 'icmp';

  @ApiProperty({ example: 'www.apple.com' })
  @IsString()
  target!: string;

  @ApiProperty({ required: false, example: 443 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  port?: number;

  @ApiProperty({ required: false, example: 3000 })
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(10000)
  @IsOptional()
  timeoutMs?: number;
}

export class ProbeNodeDto {
  @ApiProperty({ type: [ProbeItemDto], minItems: 1, maxItems: 8 })
  @ValidateNested({ each: true })
  @Type(() => ProbeItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  probes!: ProbeItemDto[];
}
