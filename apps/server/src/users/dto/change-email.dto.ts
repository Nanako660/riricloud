import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { MAX_EMAIL_LENGTH, normalizeEmail } from '../../common/auth-security';

export class ChangeEmailDto {
  @ApiProperty({ example: 'new@example.com' })
  @Transform(({ value }) => typeof value === 'string' ? normalizeEmail(value) : value)
  @IsEmail()
  @MaxLength(MAX_EMAIL_LENGTH)
  newEmail!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/)
  verificationCode!: string;

  @ApiProperty({ example: 'current-password' })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  currentPassword!: string;
}
