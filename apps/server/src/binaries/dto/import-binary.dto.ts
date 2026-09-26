import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, IsUrl, Matches, MinLength } from 'class-validator';
import { BINARY_TARGET_VALUES, type BinaryTarget } from '../binary-targets';

export class ImportBinaryDto {
  @ApiProperty({ enum: BINARY_TARGET_VALUES, example: 'agent-linux-amd64' })
  @IsIn(BINARY_TARGET_VALUES)
  target!: BinaryTarget;

  @ApiProperty({ example: '0.4.14' })
  @IsString()
  @MinLength(1)
  version!: string;

  @ApiProperty({ example: 'https://downloads.example.com/riri-agent' })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url!: string;

  @ApiProperty({ example: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' })
  @Matches(/^[a-f0-9]{64}$/i)
  sha256!: string;
}

