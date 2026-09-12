import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateBinaryResourceDto {
  @ApiPropertyOptional({ example: '定制构建，启用 v2ray api' })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({
    example: { minAgentProtocolVersion: 2, minAgentVersion: '0.6.0' },
    description: '兼容性约束对象；支持 minAgentProtocolVersion/maxAgentProtocolVersion（数字）与 minAgentVersion/maxAgentVersion/cronetVersion（字符串）'
  })
  @IsObject()
  @IsOptional()
  compatibility?: Record<string, unknown>;
}
