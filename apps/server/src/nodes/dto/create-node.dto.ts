import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// 创建节点只收基础信息；协议、参数、拓扑与端口统一通过线路管理。
export class CreateNodeDto {
  @ApiProperty({ example: '东京节点 01' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: '203.0.113.10' })
  @IsString()
  serverHost!: string;

}
