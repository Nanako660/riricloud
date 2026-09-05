import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { LOG_LEVELS, type LogLevel } from './query-logs.dto';

export class FrontendLogItemDto {
  @IsEnum(LOG_LEVELS)
  level!: LogLevel;

  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsOptional()
  @IsString()
  module?: string;

  @IsOptional()
  @IsString()
  traceId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateFrontendLogsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FrontendLogItemDto)
  logs!: FrontendLogItemDto[];
}
