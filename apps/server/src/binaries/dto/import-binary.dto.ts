import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, IsUrl, Matches, MinLength } from 'class-validator';

const binaryTargets = [
  'singbox-linux-amd64',
  'singbox-linux-arm64',
  'singbox-windows-amd64'
] as const;

export class ImportBinaryDto {
  @ApiProperty({ enum: binaryTargets, example: 'singbox-linux-amd64' })
  @IsIn(binaryTargets)
  target!: (typeof binaryTargets)[number];

  @ApiProperty({ example: '1.11.0' })
  @IsString()
  @MinLength(1)
  version!: string;

  @ApiProperty({ example: 'https://downloads.example.com/sing-box' })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url!: string;

  @ApiProperty({ example: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' })
  @Matches(/^[a-f0-9]{64}$/i)
  sha256!: string;
}
