import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested
} from 'class-validator';

export const CLEANUP_TARGETS = ['trafficHourly', 'nodeRate', 'systemLog', 'legacyTraffic'] as const;
export type CleanupTargetKind = (typeof CLEANUP_TARGETS)[number];
export const CLEANUP_MODES = ['retention', 'before', 'range', 'count', 'all'] as const;
export type CleanupMode = (typeof CLEANUP_MODES)[number];

export class TelemetryCleanupTargetDto {
  @IsIn(CLEANUP_TARGETS)
  kind!: CleanupTargetKind;

  @IsIn(CLEANUP_MODES)
  mode!: CleanupMode;

  @IsOptional()
  @IsDateString()
  before?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  keepLatest?: number;
}

export class TelemetryCleanupDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CLEANUP_TARGETS.length)
  @ValidateNested({ each: true })
  @Type(() => TelemetryCleanupTargetDto)
  targets!: TelemetryCleanupTargetDto[];

  @IsOptional()
  @IsString()
  confirmationPhrase?: string;
}

export const VACUUM_TARGETS = ['main', 'telemetry'] as const;
export type VacuumTarget = (typeof VACUUM_TARGETS)[number];

export class VacuumDatabaseDto {
  @IsOptional()
  @IsArray()
  @IsIn(VACUUM_TARGETS, { each: true })
  targets?: VacuumTarget[];
}

export interface DatabaseFileStat {
  target: 'main' | 'telemetry';
  path: string;
  size: number;
  walSize: number;
  shmSize: number;
  totalSize: number;
}

export interface DatabaseStatsResponse {
  databases: DatabaseFileStat[];
  totalBytes: number;
}

export interface VacuumResultItem {
  target: 'main' | 'telemetry';
  path: string;
  bytesBefore: number;
  bytesAfter: number;
  reclaimedBytes: number;
}

export interface VacuumResponse {
  results: VacuumResultItem[];
  totalReclaimedBytes: number;
  completedAt: string;
}

