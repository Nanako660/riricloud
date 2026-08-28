import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@riricloud.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'riri-admin-demo' })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  password!: string;
}
