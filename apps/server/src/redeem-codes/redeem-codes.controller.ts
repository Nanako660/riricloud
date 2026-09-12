import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { BatchRedeemCodesDto } from './dto/batch-redeem-codes.dto';
import { BatchRevokeRedeemCodesDto } from './dto/batch-revoke-redeem-codes.dto';
import { CleanupRedeemCodesDto } from './dto/cleanup-redeem-codes.dto';
import { ExportRedeemCodesDto } from './dto/export-redeem-codes.dto';
import { QueryRedeemCodesDto } from './dto/query-redeem-codes.dto';
import { RedeemCodesService } from './redeem-codes.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/redeem-codes')
export class RedeemCodesController {
  constructor(private readonly redeemCodesService: RedeemCodesService) {}

  @Get()
  list(@Query() query: QueryRedeemCodesDto) {
    return this.redeemCodesService.list(query);
  }

  @Get('stats')
  stats() {
    return this.redeemCodesService.stats();
  }

  @Get('export')
  export(@Query() query: ExportRedeemCodesDto, @Res({ passthrough: true }) res: Response) {
    const format = query.format ?? 'csv';
    res.setHeader('Content-Type', format === 'csv' ? 'text/csv; charset=utf-8' : 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="riricloud-redeem-codes-${new Date().toISOString().slice(0, 10)}.${format}"`);
    return this.redeemCodesService.export(query, format);
  }

  @Post('batch')
  batch(@Body() dto: BatchRedeemCodesDto, @CurrentUser() operator: { id: string }) {
    return this.redeemCodesService.batchCreate(dto, operator.id);
  }

  @Post('batch-revoke')
  batchRevoke(@Body() dto: BatchRevokeRedeemCodesDto, @CurrentUser() operator: { id: string }) {
    return this.redeemCodesService.batchRevoke(dto.ids, operator.id);
  }

  @Post('cleanup')
  cleanup(@Body() dto: CleanupRedeemCodesDto, @CurrentUser() operator: { id: string }) {
    return this.redeemCodesService.cleanup(dto.retentionDays ?? 30, operator.id);
  }

  @Post(':id/revoke')
  revoke(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() operator: { id: string }) {
    return this.redeemCodesService.revoke(id, operator.id);
  }
}
