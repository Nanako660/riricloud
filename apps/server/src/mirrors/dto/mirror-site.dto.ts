import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class CreateMirrorSiteDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{2,62}$/, { message: 'slug 只能包含小写字母、数字和连字符，长度为 3-63' })
  slug!: string;

  @IsString()
  @MaxLength(2048)
  upstreamBaseUrl!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(16)
  @IsString({ each: true })
  allowedOrigins!: string[];

  @IsString()
  nodeId!: string;

  @IsIn(['ADMIN', 'SHARE', 'PUBLIC'])
  accessMode!: 'ADMIN' | 'SHARE' | 'PUBLIC';

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  enabled?: boolean;

  @IsOptional()
  @ValidateIf((value: CreateMirrorSiteDto) => value.accessMode === 'SHARE')
  @IsDateString()
  shareExpiresAt?: string;
}

export class UpdateMirrorSiteDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{2,62}$/)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  upstreamBaseUrl?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(16)
  @IsString({ each: true })
  allowedOrigins?: string[];

  @IsOptional()
  @IsString()
  nodeId?: string;

  @IsOptional()
  @IsIn(['ADMIN', 'SHARE', 'PUBLIC'])
  accessMode?: 'ADMIN' | 'SHARE' | 'PUBLIC';

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  enabled?: boolean;

  @IsOptional()
  @IsDateString()
  shareExpiresAt?: string | null;
}

export class ListMirrorSitesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
