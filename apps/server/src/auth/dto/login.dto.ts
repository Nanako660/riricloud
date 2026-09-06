import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MAX_EMAIL_LENGTH, normalizeEmail } from '../../common/auth-security';

export class LoginDto {
  @ApiProperty({ example: 'admin@riricloud.local' })
  @Transform(({ value }) => typeof value === 'string' ? normalizeEmail(value) : value)
  @IsEmail()
  @MaxLength(MAX_EMAIL_LENGTH)
  email!: string;

  @ApiProperty({ example: 'Strong-password1!' })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  password!: string;
}
