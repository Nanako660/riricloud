import { IsIn, IsOptional, IsString, IsUrl, IsUUID, Matches, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpgradeNodeDto {
  @ApiProperty({ enum: ['singbox', 'agent'] })
  @IsIn(['singbox', 'agent'])
  target!: 'singbox' | 'agent';

  @ApiProperty({ required: false, format: 'uuid', description: '主控资源版本 ID；与自定义 URL 二选一' })
  @IsUUID()
  @IsOptional()
  resourceId?: string;

  @ApiProperty({ example: '1.11.0' })
  @IsString()
  @IsOptional()
  @MinLength(1)
  version?: string;

  @ApiProperty({ example: 'https://downloads.example.com/sing-box' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url?: string;

  @ApiProperty({ example: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' })
  @IsOptional()
  @Matches(/^[a-f0-9]{64}$/i)
  sha256?: string;
}
