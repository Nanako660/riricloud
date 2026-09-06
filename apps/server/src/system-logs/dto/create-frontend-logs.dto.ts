import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, Validate, ValidateNested, ValidatorConstraint, type ValidatorConstraintInterface } from 'class-validator';
import { LOG_LEVELS, type LogLevel } from './query-logs.dto';

@ValidatorConstraint({ name: 'safeLogMetadata', async: false })
class SafeLogMetadataConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === undefined) return true;
    try {
      if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 16 * 1024) return false;
    } catch {
      return false;
    }
    return maxDepth(value) <= 5;
  }

  defaultMessage(): string {
    return 'metadata 过大或嵌套层级过深';
  }
}

function maxDepth(value: unknown, depth = 0): number {
  if (!value || typeof value !== 'object') return depth;
  const entries = Array.isArray(value) ? value : Object.values(value);
  return entries.reduce((max, item) => Math.max(max, maxDepth(item, depth + 1)), depth);
}

export class FrontendLogItemDto {
  @IsEnum(LOG_LEVELS)
  level!: LogLevel;

  @IsString()
  @IsNotEmpty()
  @MaxLength(8192)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  module?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  traceId?: string;

  @IsOptional()
  @IsObject()
  @Validate(SafeLogMetadataConstraint)
  metadata?: Record<string, unknown>;
}

export class CreateFrontendLogsDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => FrontendLogItemDto)
  logs!: FrontendLogItemDto[];
}
