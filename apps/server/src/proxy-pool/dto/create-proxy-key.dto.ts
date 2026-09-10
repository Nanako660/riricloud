import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProxyKeyDto {
  @ApiProperty({ example: '爬虫项目 A', description: '凭据备注名称' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @ApiPropertyOptional({
    example: '203.0.113.10,198.51.100.0/24',
    description: '来源 IP/CIDR 白名单，多条以逗号或换行分隔；留空表示不限制来源'
  })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  whitelistIps?: string;
}
