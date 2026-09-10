import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const PROXY_POOL_EXPORT_FORMATS = ['text', 'uri', 'json'] as const;
export type ProxyPoolExportFormat = (typeof PROXY_POOL_EXPORT_FORMATS)[number];

export const PROXY_POOL_EXPORT_PROTOCOLS = ['socks5', 'http'] as const;
export type ProxyPoolExportProtocol = (typeof PROXY_POOL_EXPORT_PROTOCOLS)[number];

export class QueryProxyPoolExportDto {
  @ApiPropertyOptional({ enum: PROXY_POOL_EXPORT_FORMATS, default: 'text', description: '导出格式' })
  @IsIn(PROXY_POOL_EXPORT_FORMATS)
  @IsOptional()
  format?: ProxyPoolExportFormat = 'text';

  @ApiPropertyOptional({ enum: PROXY_POOL_EXPORT_PROTOCOLS, default: 'socks5', description: 'URI 导出的协议前缀' })
  @IsIn(PROXY_POOL_EXPORT_PROTOCOLS)
  @IsOptional()
  protocol?: ProxyPoolExportProtocol = 'socks5';

  @ApiPropertyOptional({ description: '指定导出哪一条凭据；省略时使用账号下第一条启用凭据' })
  @IsUUID()
  @IsOptional()
  keyId?: string;

  @ApiPropertyOptional({ description: '按线路 ID 过滤，多个以逗号分隔' })
  @IsString()
  @MaxLength(4000)
  @IsOptional()
  lineIds?: string;

  @ApiPropertyOptional({ description: '免登录拉取令牌（ProxyKey exportToken）' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  token?: string;
}
