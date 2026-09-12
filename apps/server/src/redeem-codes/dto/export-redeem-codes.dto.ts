import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { QueryRedeemCodesDto } from './query-redeem-codes.dto';

export const REDEEM_CODE_EXPORT_FORMATS = ['csv', 'txt'] as const;
export type RedeemCodeExportFormat = (typeof REDEEM_CODE_EXPORT_FORMATS)[number];

export class ExportRedeemCodesDto extends QueryRedeemCodesDto {
  @ApiPropertyOptional({ enum: REDEEM_CODE_EXPORT_FORMATS, default: 'csv', description: 'csv 含全部审计字段，txt 仅卡密行' })
  @IsIn(REDEEM_CODE_EXPORT_FORMATS)
  @IsOptional()
  format?: RedeemCodeExportFormat = 'csv';
}
