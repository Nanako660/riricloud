import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export class PollTrafficRecordDto {
  @IsString()
  userUuid!: string;

  @IsInt()
  @Min(0)
  upload!: number;

  @IsInt()
  @Min(0)
  download!: number;
}

export class PollConfigApplyResultDto {
  @IsInt()
  @Min(0)
  version!: number;

  @IsBoolean()
  success!: boolean;

  @IsString()
  message!: string;
}

export class PollUpgradeResultDto {
  @IsString()
  taskId!: string;

  @IsIn(['singbox', 'agent'])
  target!: 'singbox' | 'agent';

  @IsString()
  version!: string;

  @IsBoolean()
  success!: boolean;

  @IsString()
  message!: string;
}

export class PollProbeResultItemDto {
  @IsIn(['tcp', 'dns', 'icmp'])
  type!: 'tcp' | 'dns' | 'icmp';

  @IsString()
  target!: string;

  @IsBoolean()
  success!: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  latencyMs?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(16)
  @IsString({ each: true })
  addresses?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  packetLossPercent?: number;

  @IsOptional()
  @IsString()
  message?: string;
}

export class PollProbeResultDto {
  @IsString()
  taskId!: string;

  @IsBoolean()
  success!: boolean;

  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => PollProbeResultItemDto)
  results!: PollProbeResultItemDto[];
}

export class PollRestartAgentResultDto {
  @IsString()
  taskId!: string;

  @IsBoolean()
  success!: boolean;

  @IsString()
  message!: string;
}

export class AgentPollDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  cpuUsage!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  memoryUsage!: number;

  @IsNumber()
  @Min(0)
  bandwidthRate!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  uploadRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  downloadRate?: number;

  @IsArray()
  @ArrayMaxSize(1024)
  @ValidateNested({ each: true })
  @Type(() => PollTrafficRecordDto)
  trafficRecords!: PollTrafficRecordDto[];

  @IsOptional()
  @IsBoolean()
  kernelRunning?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  appliedConfigVersion?: number;

  @IsOptional()
  @IsString()
  lastError?: string;

  @IsOptional()
  @IsString()
  agentVersion?: string;

  @IsOptional()
  @IsString()
  osArch?: string;

  @IsOptional()
  @IsString()
  kernelVersion?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => PollConfigApplyResultDto)
  configApplyResults?: PollConfigApplyResultDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => PollUpgradeResultDto)
  upgradeResults?: PollUpgradeResultDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => PollProbeResultDto)
  probeResults?: PollProbeResultDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => PollRestartAgentResultDto)
  restartAgentResults?: PollRestartAgentResultDto[];
}
