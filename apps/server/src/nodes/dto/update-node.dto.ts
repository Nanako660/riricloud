import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

// 协议与 Reality 密钥本版本锁定不可改（改协议需重新生成密钥对并重装 Agent）
export class UpdateNodeDto {
  @ApiPropertyOptional({ example: '东京节点 01' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: '203.0.113.10' })
  @IsString()
  @IsOptional()
  serverHost?: string;

  @ApiPropertyOptional({ example: 443, minimum: 1, maximum: 65535 })
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  serverPort?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;
}
