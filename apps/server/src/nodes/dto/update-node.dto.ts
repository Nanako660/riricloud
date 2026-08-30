import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Min, ValidateIf } from 'class-validator';
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

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @ApiPropertyOptional({ example: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  // 高级模式：完整 singboxConfig 顶层覆盖 JSON 字符串；传 null 清除覆盖
  @ApiPropertyOptional({ example: '{"log":{"level":"debug"}}', nullable: true })
  @ValidateIf((o: UpdateNodeDto) => o.configOverride !== null)
  @IsString()
  @IsOptional()
  configOverride?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ minimum: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  level?: number;
}
