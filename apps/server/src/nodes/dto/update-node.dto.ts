import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateNodeDto {
  @ApiPropertyOptional({ example: '东京节点 01' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: '203.0.113.10' })
  @IsString()
  @IsOptional()
  serverHost?: string;

  // 高级模式：完整 singboxConfig 顶层覆盖 JSON 字符串；传 null 清除覆盖
  @ApiPropertyOptional({ example: '{"log":{"level":"debug"}}', nullable: true })
  @ValidateIf((o: UpdateNodeDto) => o.configOverride !== null)
  @IsString()
  @IsOptional()
  configOverride?: string | null;

  @ApiPropertyOptional({ enum: ['WS', 'HTTP'] })
  @IsIn(['WS', 'HTTP'])
  @IsOptional()
  communicationMode?: 'WS' | 'HTTP';

  @ApiPropertyOptional({ example: 15, minimum: 5, maximum: 300 })
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(300)
  @IsOptional()
  pollIntervalSecs?: number;

}
