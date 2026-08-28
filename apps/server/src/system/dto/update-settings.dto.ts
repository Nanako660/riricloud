import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSettingsDto {
  @ApiPropertyOptional({ example: '我的面板' })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  @IsOptional()
  siteName?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  registrationEnabled?: boolean;

  @ApiPropertyOptional({ example: 107374182400, description: '字节；0 不合法' })
  @IsInt()
  @IsOptional()
  defaultTrafficLimitBytes?: number;
}
