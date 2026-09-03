import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RedeemCodeDto {
  @ApiProperty({ example: 'RIRI-AB12CD34EF56' })
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  code!: string;
}
