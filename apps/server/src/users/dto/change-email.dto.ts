import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ChangeEmailDto {
  @ApiProperty({ example: 'new@example.com' })
  @IsEmail()
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
