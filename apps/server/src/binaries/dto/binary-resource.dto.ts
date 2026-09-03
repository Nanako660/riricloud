import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUrl, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export const BINARY_KINDS = ['AGENT', 'SINGBOX'] as const;
export type ManagedBinaryKind = (typeof BINARY_KINDS)[number];

export const BINARY_STATUSES = ['DRAFT', 'ACTIVE', 'DISABLED', 'RETIRED'] as const;
export type ManagedBinaryStatus = (typeof BINARY_STATUSES)[number];

export class BinaryResourceImportDto {
  @ApiProperty({ enum: BINARY_KINDS, example: 'SINGBOX' })
  @IsIn(BINARY_KINDS)
  kind!: ManagedBinaryKind;

  @ApiProperty({ example: '1.14.0' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  upstreamVersion!: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9999)
  @IsOptional()
  revision?: number;

  @ApiProperty({ example: 'singbox-linux-amd64' })
  @IsString()
  @Matches(/^(agent|singbox)-(linux|windows|macos)-(amd64|arm64|armv7)$/)
  target!: string;

  @ApiPropertyOptional({ example: 'sing-box' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @IsOptional()
  filename?: string;

  @ApiPropertyOptional({ example: '0.5.0' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  builtFromAppVersion?: string;

  @ApiPropertyOptional({ example: '{"minAgentProtocolVersion":2}' })
  @IsString()
  @MaxLength(4096)
  @IsOptional()
  compatibilityJson?: string;

  @ApiPropertyOptional({ example: '定制构建，启用 v2ray api' })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  notes?: string;

  @ApiProperty({ example: 'https://downloads.example.com/sing-box' })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url!: string;

  @ApiProperty({ example: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' })
  @Matches(/^[a-f0-9]{64}$/i)
  sha256!: string;
}

export class BinaryResourceUploadDto {
  @ApiProperty({ enum: BINARY_KINDS, example: 'SINGBOX' })
  @IsIn(BINARY_KINDS)
  kind!: ManagedBinaryKind;

  @ApiProperty({ example: '1.14.0' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  upstreamVersion!: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9999)
  @IsOptional()
  revision?: number;

  @ApiProperty({ example: 'singbox-linux-amd64' })
  @IsString()
  @Matches(/^(agent|singbox)-(linux|windows|macos)-(amd64|arm64|armv7)$/)
  target!: string;

  @ApiPropertyOptional({ example: 'sing-box' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @IsOptional()
  filename?: string;

  @ApiPropertyOptional({ example: '0.5.0' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  builtFromAppVersion?: string;

  @ApiPropertyOptional({ example: '{"minAgentProtocolVersion":2}' })
  @IsString()
  @MaxLength(4096)
  @IsOptional()
  compatibilityJson?: string;

  @ApiPropertyOptional({ example: '定制构建，启用 v2ray api' })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  notes?: string;

  @ApiProperty({ example: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' })
  @Matches(/^[a-f0-9]{64}$/i)
  sha256!: string;
}
