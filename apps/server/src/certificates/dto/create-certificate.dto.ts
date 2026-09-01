import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCertificateDto {
  @ApiProperty({ example: 'api.example.com 生产证书' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  @ApiProperty({ description: 'PEM 编码的 X.509 证书（仅叶子证书）' })
  @IsString()
  @MinLength(1)
  certificatePem!: string;

  @ApiProperty({ description: 'PEM 编码的未加密私钥' })
  @IsString()
  @MinLength(1)
  privateKeyPem!: string;
}

export class UpdateCertificateDto {
  @ApiPropertyOptional({ example: 'api.example.com 生产证书' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'PEM 编码的 X.509 证书（仅叶子证书）' })
  @IsString()
  @MinLength(1)
  @IsOptional()
  certificatePem?: string;

  @ApiPropertyOptional({ description: 'PEM 编码的未加密私钥；省略时保留原私钥' })
  @IsString()
  @MinLength(1)
  @IsOptional()
  privateKeyPem?: string;
}

export class ParseCertificateDto {
  @ApiProperty({ description: 'PEM 编码的 X.509 证书（仅叶子证书）' })
  @IsString()
  @MinLength(1)
  certificatePem!: string;

  @ApiPropertyOptional({ description: '可选：用于即时校验公私钥是否匹配' })
  @IsString()
  @MinLength(1)
  @IsOptional()
  privateKeyPem?: string;
}
