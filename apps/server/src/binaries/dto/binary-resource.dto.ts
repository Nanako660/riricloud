import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUrl, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { BINARY_KINDS, BINARY_TARGET_VALUES, ManagedBinaryKind } from '../binary-targets';

export { BINARY_KINDS };
export type { ManagedBinaryKind };

export const BINARY_STATUSES = ['DRAFT', 'ACTIVE', 'DISABLED', 'RETIRED'] as const;
export type ManagedBinaryStatus = (typeof BINARY_STATUSES)[number];

export class BinaryResourceImportDto {
  @ApiPropertyOptional({ enum: BINARY_KINDS, default: 'AGENT', example: 'AGENT' })
  @IsIn(BINARY_KINDS)
  @IsOptional()
  kind?: ManagedBinaryKind;

  @ApiPropertyOptional({ example: '0.4.14', description: '留空时自动从二进制内嵌标识或 URL 提取' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  upstreamVersion?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9999)
  @IsOptional()
  revision?: number;

  @ApiPropertyOptional({ example: 'agent-linux-amd64', enum: BINARY_TARGET_VALUES, description: '留空时自动从 ELF/Mach-O/PE 文件头或 URL 识别' })
  @IsIn(BINARY_TARGET_VALUES)
  @IsOptional()
  target?: string;

  @ApiPropertyOptional({ example: 'riri-agent' })
  @IsString()
  @MaxLength(128)
  @IsOptional()
  filename?: string;

  @ApiPropertyOptional({ example: '0.4.14' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  builtFromAppVersion?: string;

  @ApiPropertyOptional({ example: '{"minAgentProtocolVersion":2}' })
  @IsString()
  @MaxLength(4096)
  @IsOptional()
  compatibilityJson?: string;

  @ApiPropertyOptional({ example: '定制构建' })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  notes?: string;

  @ApiProperty({ example: 'https://github.com/Nanako660/riricloud/releases/download/agent-v0.4.14/riri-agent_0.4.14_linux_amd64.tar.gz' })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url!: string;

  @ApiPropertyOptional({ description: '可选预期 SHA-256；留空时由服务端自动计算' })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/i)
  @IsOptional()
  sha256?: string;
}

export class BinaryResourceUploadDto {
  @ApiPropertyOptional({ enum: BINARY_KINDS, default: 'AGENT', example: 'AGENT' })
  @IsIn(BINARY_KINDS)
  @IsOptional()
  kind?: ManagedBinaryKind;

  @ApiPropertyOptional({ example: '0.4.14', description: '留空时自动从二进制内嵌标识或文件名提取' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  upstreamVersion?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9999)
  @IsOptional()
  revision?: number;

  @ApiPropertyOptional({ example: 'agent-linux-amd64', enum: BINARY_TARGET_VALUES, description: '留空时自动从二进制魔数头或文件名识别' })
  @IsIn(BINARY_TARGET_VALUES)
  @IsOptional()
  target?: string;

  @ApiPropertyOptional({ example: 'riri-agent' })
  @IsString()
  @MaxLength(128)
  @IsOptional()
  filename?: string;

  @ApiPropertyOptional({ example: '0.4.14' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  builtFromAppVersion?: string;

  @ApiPropertyOptional({ example: '{"minAgentProtocolVersion":2}' })
  @IsString()
  @MaxLength(4096)
  @IsOptional()
  compatibilityJson?: string;

  @ApiPropertyOptional({ example: '本地构建上传' })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: '可选预期 SHA-256；留空时由服务端自动计算' })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/i)
  @IsOptional()
  sha256?: string;
}

export class BinaryResourceGithubImportDto {
  @ApiProperty({ example: 'agent-v0.4.14', description: 'GitHub Release Tag 名称' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  tagName!: string;

  @ApiPropertyOptional({
    type: [String],
    enum: BINARY_TARGET_VALUES,
    description: '要拉取的平台列表；留空或省略时拉取该 Release 下全部可用平台'
  })
  @IsArray()
  @ArrayMaxSize(10)
  @IsIn(BINARY_TARGET_VALUES, { each: true })
  @IsOptional()
  targets?: string[];

  @ApiPropertyOptional({ example: '从项目 GitHub Release 同步' })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  notes?: string;
}
