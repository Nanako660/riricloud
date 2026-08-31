import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { LINE_STATUSES, LINE_TYPES, PROTOCOL_TYPES, RELAY_MODES, LineStatus, LineType, ProtocolType, RelayMode } from '../../common/constants';

export class UpdateLineDto {
  @ApiPropertyOptional()
  @IsString()
  @MinLength(1)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @IsOptional()
  tag?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @IsOptional()
  listen?: string;

  @ApiPropertyOptional({ enum: LINE_TYPES })
  @IsIn(LINE_TYPES)
  @IsOptional()
  type?: LineType;

  @ApiPropertyOptional({ enum: PROTOCOL_TYPES })
  @IsIn(PROTOCOL_TYPES)
  @IsOptional()
  protocolType?: ProtocolType;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  params?: Record<string, unknown>;

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

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsUUID()
  @IsOptional()
  exitNodeId?: string | null;

  @ApiPropertyOptional({ minimum: 1, maximum: 65535, nullable: true })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  exitPort?: number | null;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  endpointOverrideEnabled?: boolean;

  @ApiPropertyOptional()
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

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  serverName?: string | null;

  @ApiPropertyOptional()
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
