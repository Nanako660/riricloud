import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// 创建节点只收基础信息：入站在节点详情中单独管理（POST /admin/nodes/:id/inbounds）
export class CreateNodeDto {
  @ApiProperty({ example: '东京节点 01' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: '203.0.113.10' })
  @IsString()
  serverHost!: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @ApiPropertyOptional({ type: [String], example: ['vip', 'hk'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ example: 1, minimum: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  level?: number;
}
