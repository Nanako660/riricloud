import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { LINE_STATUSES, LINE_TYPES, RELAY_MODES, LineStatus, LineType, RelayMode } from '../../common/constants';

export class UpdateLineDto {
  @ApiPropertyOptional()
  @IsString()
  @MinLength(1)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ enum: LINE_TYPES })
  @IsIn(LINE_TYPES)
  @IsOptional()
  type?: LineType;

  @ApiPropertyOptional({ enum: RELAY_MODES, nullable: true })
  @IsIn(RELAY_MODES)
  @IsOptional()
  relayMode?: RelayMode | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsUUID()
  @IsOptional()
  entryNodeId?: string | null;

  @ApiPropertyOptional({ minimum: 1, maximum: 65535, nullable: true })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  entryPort?: number | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  targetInboundId?: string;

  @ApiPropertyOptional({ default: false, description: '是否启用线路对外端点覆盖；关闭时复用入口/目标入站默认设置' })
  @IsBoolean()
  @IsOptional()
  endpointOverrideEnabled?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsString()
  @IsOptional()
  serverHost?: string | null;

  @ApiPropertyOptional({ minimum: 1, maximum: 65535, nullable: true })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  serverPort?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsString()
  @IsOptional()
  serverName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsString()
  @IsOptional()
  host?: string | null;

  @ApiPropertyOptional({ minimum: 0.01 })
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.01)
  @IsOptional()
  trafficRate?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  level?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @ApiPropertyOptional({ enum: LINE_STATUSES })
  @IsIn(LINE_STATUSES)
  @IsOptional()
  status?: LineStatus;
}
