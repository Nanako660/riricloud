import { IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PROTOCOL_TYPES, ProtocolType } from '../../common/constants';

export class CreateInboundDto {
  @ApiProperty({ enum: PROTOCOL_TYPES, example: 'VLESS' })
  @IsIn(PROTOCOL_TYPES)
  type!: ProtocolType;

  // 缺省按协议生成（如 vless-in），节点内唯一，冲突自动追加序号
  @ApiPropertyOptional({ example: 'vless-in' })
  @IsString()
  @IsOptional()
  tag?: string;

  @ApiPropertyOptional({ example: '0.0.0.0', default: '0.0.0.0', description: '缺省监听所有 IPv4 网卡' })
  @IsString()
  @IsOptional()
  listen?: string;

  @ApiPropertyOptional({ example: 23456, minimum: 1, maximum: 65535, description: '缺省由服务端生成五位随机端口' })
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  port?: number;

  // 协议专属参数（结构见 docs/DATA_MODELS.md §3.1）；Reality 密钥对与 SS 密码缺省自动生成
  @ApiPropertyOptional({ example: { serverNames: ['www.apple.com'], dest: 'www.apple.com:443' } })
  @IsObject()
  @IsOptional()
  params?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

}

export class UpdateInboundDto {
  @ApiPropertyOptional({ example: 'vless-in' })
  @IsString()
  @IsOptional()
  tag?: string;

  @ApiPropertyOptional({ example: '0.0.0.0', description: '缺省监听所有 IPv4 网卡' })
  @IsString()
  @IsOptional()
  listen?: string;

  @ApiPropertyOptional({ example: 443, minimum: 1, maximum: 65535 })
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  port?: number;

  // 与现有 paramsJson 浅合并后重新归一化（未提供的键保持原值，私钥不会因脱敏回传丢失）
  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  params?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

}
