import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  registerDecorator,
  type ValidationOptions,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface
} from 'class-validator';
import { AGENT_PROTOCOL_VERSION } from '../agent-message';

const MAX_UINT64 = 18446744073709551615n;

@ValidatorConstraint({ name: 'isUint64String', async: false })
class IsUint64StringConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || !/^(0|[1-9]\d{0,19})$/.test(value)) return false;
    try {
      return BigInt(value) <= MAX_UINT64;
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return '$property must be an unsigned 64-bit decimal string';
  }
}

function IsUint64String(validationOptions?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'isUint64String',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      options: validationOptions,
      validator: IsUint64StringConstraint
    });
  };
}

export class PollTrafficSnapshotDto {
  @IsString()
  userUuid!: string;

  @IsString()
  @IsUint64String()
  uploadTotal!: string;

  @IsString()
  @IsUint64String()
  downloadTotal!: string;
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
  @IsInt()
  @Equals(AGENT_PROTOCOL_VERSION)
  protocolVersion!: number;

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
  @Type(() => PollTrafficSnapshotDto)
  trafficSnapshots!: PollTrafficSnapshotDto[];

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
