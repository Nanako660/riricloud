import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const LOG_SOURCES = ['SERVER', 'WEB', 'AGENT', 'SINGBOX'] as const;
export type LogSource = (typeof LOG_SOURCES)[number];

export class QueryLogsDto {
  @IsOptional()
  @IsEnum(LOG_LEVELS)
  level?: LogLevel;

  @IsOptional()
  @IsEnum(LOG_SOURCES)
  source?: LogSource;

  @IsOptional()
  @IsString()
  nodeId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  module?: string;

  @IsOptional()
  @IsString()
  traceId?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 50;
}
