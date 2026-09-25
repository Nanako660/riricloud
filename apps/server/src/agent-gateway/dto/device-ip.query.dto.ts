import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIP, IsOptional } from 'class-validator';

export class DeviceIpQueryDto {
  @ApiPropertyOptional({ description: '指定客户端 IP；省略表示全部在线设备', example: '203.0.113.10' })
  @IsOptional()
  @IsIP()
  ip?: string;
}
