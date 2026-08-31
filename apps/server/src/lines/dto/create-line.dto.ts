import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LINE_STATUSES, LINE_TYPES, RELAY_MODES, LineStatus, LineType, RelayMode } from '../../common/constants';

export class CreateLineDto {
  @ApiProperty({ example: '香港落地线路' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ enum: LINE_TYPES, default: 'DIRECT' })
  @IsIn(LINE_TYPES)
  @IsOptional()
  type?: LineType;

  @ApiPropertyOptional({ enum: RELAY_MODES })
  @IsIn(RELAY_MODES)
  @IsOptional()
  relayMode?: RelayMode;

  @ApiPropertyOptional({ format: 'uuid', description: '中继入口节点；直连线路省略时自动取目标入站所属节点' })
  @IsUUID()
  @IsOptional()
  entryNodeId?: string;

  @ApiPropertyOptional({ example: 8443, minimum: 1, maximum: 65535 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  entryPort?: number;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  targetInboundId!: string;

  @ApiPropertyOptional({ default: false, description: '是否启用线路对外端点覆盖；关闭时复用入口/目标入站默认设置' })
  @IsBoolean()
  @IsOptional()
  endpointOverrideEnabled?: boolean;

  @ApiPropertyOptional({ example: 'edge.example.com', description: '对外连接地址覆盖；省略时使用底层节点地址' })
  @IsString()
  @IsOptional()
  serverHost?: string;

  @ApiPropertyOptional({ example: 443, minimum: 1, maximum: 65535, description: '对外连接端口覆盖' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  serverPort?: number;

  @ApiPropertyOptional({ example: 'www.apple.com', description: 'SNI 覆盖' })
  @IsString()
  @IsOptional()
  serverName?: string;

  @ApiPropertyOptional({ example: 'cdn.example.com', description: 'Host 覆盖' })
  @IsString()
  @IsOptional()
  host?: string;

  @ApiPropertyOptional({ example: 1.5, default: 1, minimum: 0.01 })
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.01)
  @IsOptional()
  trafficRate?: number;

  @ApiPropertyOptional({ type: [String], example: ['hk', 'relay'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ example: 1, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  level?: number;

  @ApiPropertyOptional({ example: 0, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @ApiPropertyOptional({ enum: LINE_STATUSES, default: 'ACTIVE' })
  @IsIn(LINE_STATUSES)
  @IsOptional()
  status?: LineStatus;
}
