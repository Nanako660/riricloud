import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetProxyKeyActiveDto {
  @ApiProperty({ description: '是否启用该代理凭据' })
  @IsBoolean()
  isActive!: boolean;
}
