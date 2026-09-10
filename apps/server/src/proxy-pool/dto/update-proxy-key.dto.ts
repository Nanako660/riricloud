import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProxyKeyDto {
  @ApiPropertyOptional({ example: '爬虫项目 A（已轮换）' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: '203.0.113.10', description: '留空字符串表示清空白名单' })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  whitelistIps?: string;

  @ApiPropertyOptional({ description: '单键启停，禁用后节点配置立即吊销该凭据' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
