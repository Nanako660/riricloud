import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PROTOCOL_TYPES, ProtocolType } from '../../common/constants';

export class CreateNodeDto {
  @ApiProperty({ example: '东京节点 01' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: '203.0.113.10' })
  @IsString()
  serverHost!: string;

  @ApiProperty({ example: 443 })
  @IsInt()
  serverPort!: number;

  @ApiProperty({ enum: PROTOCOL_TYPES, default: 'VLESS_REALITY' })
  @IsString()
  @IsOptional()
  protocol?: ProtocolType;

  @ApiPropertyOptional({ example: true, default: true })
  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;
}
