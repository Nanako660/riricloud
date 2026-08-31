import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// 创建节点只收基础信息：入站在节点详情中单独管理（POST /admin/nodes/:id/inbounds）
export class CreateNodeDto {
  @ApiProperty({ example: '东京节点 01' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: '203.0.113.10' })
  @IsString()
  serverHost!: string;

}
