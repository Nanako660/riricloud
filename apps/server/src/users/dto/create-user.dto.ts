import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ROLES, Role } from '../../common/constants';

export class CreateUserDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'strong-password', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  password!: string;

  @ApiPropertyOptional({ enum: ROLES, default: 'USER' })
  @IsString()
  @IsOptional()
  role?: Role;

  @ApiPropertyOptional({ example: 107374182400, description: '字节；缺省取系统设置默认配额' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  trafficLimitBytes?: number;

  @ApiPropertyOptional({ example: '2027-01-01T00:00:00Z', description: 'ISO 日期；缺省永久' })
  @IsString()
  @IsOptional()
  expireAt?: string;
}
