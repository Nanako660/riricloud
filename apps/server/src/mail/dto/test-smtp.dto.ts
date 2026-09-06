import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';
import { MAX_EMAIL_LENGTH, normalizeEmail } from '../../common/auth-security';

export class TestSmtpDto {
  @ApiProperty({ example: 'admin@example.com' })
  @Transform(({ value }) => typeof value === 'string' ? normalizeEmail(value) : value)
  @IsEmail()
  @MaxLength(MAX_EMAIL_LENGTH)
  email!: string;
}
