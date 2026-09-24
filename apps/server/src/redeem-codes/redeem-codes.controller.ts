import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RedeemCodeDto } from '../wallet/dto/redeem-code.dto';
import { BatchRedeemCodesDto } from './dto/batch-redeem-codes.dto';
import { BatchRevokeRedeemCodesDto } from './dto/batch-revoke-redeem-codes.dto';
import { CleanupRedeemCodesDto } from './dto/cleanup-redeem-codes.dto';
import { ExportRedeemCodesDto } from './dto/export-redeem-codes.dto';
import { QueryRedeemCodesDto } from './dto/query-redeem-codes.dto';
import { CreateRedeemCodeCategoryDto, UpdateRedeemCodeCategoryDto } from './dto/redeem-code-category.dto';
import { RedeemCodesService } from './redeem-codes.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/redeem-codes')
export class RedeemCodesController {
  constructor(private readonly redeemCodesService: RedeemCodesService) {}

  @Get('categories') categories() { return this.redeemCodesService.listCategories(); }
  @Post('categories') createCategory(@Body() dto: CreateRedeemCodeCategoryDto, @CurrentUser() user: { id: string }) { return this.redeemCodesService.createCategory(dto, user.id); }
  @Patch('categories/:id') updateCategory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRedeemCodeCategoryDto, @CurrentUser() user: { id: string }) { return this.redeemCodesService.updateCategory(id, dto, user.id); }

  @Get() list(@Query() query: QueryRedeemCodesDto) { return this.redeemCodesService.list(query); }
  @Get('stats') stats(@Query('categoryId') categoryId?: string, @Query('deletedOnly') deletedOnly?: string) { return this.redeemCodesService.stats(categoryId, deletedOnly === 'true'); }
  @Get('export') export(@Query() query: ExportRedeemCodesDto, @Res({ passthrough: true }) res: Response) {
    const format = query.format ?? 'csv';
    res.setHeader('Content-Type', format === 'csv' ? 'text/csv; charset=utf-8' : 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="riricloud-redeem-codes-${new Date().toISOString().slice(0, 10)}.${format}"`);
    return this.redeemCodesService.export(query, format);
  }
  @Post('batch') batch(@Body() dto: BatchRedeemCodesDto, @CurrentUser() operator: { id: string }) { return this.redeemCodesService.batchCreate(dto, operator.id); }
  @Post('batch-revoke') batchRevoke(@Body() dto: BatchRevokeRedeemCodesDto, @CurrentUser() operator: { id: string }) { return this.redeemCodesService.batchRevoke(dto.ids, operator.id); }
  @Post('batch-delete') batchDelete(@Body() dto: BatchRevokeRedeemCodesDto, @CurrentUser() operator: { id: string }) { return this.redeemCodesService.softDelete(dto.ids, operator.id); }
  @Post('cleanup') cleanup(@Body() dto: CleanupRedeemCodesDto, @CurrentUser() operator: { id: string }) { return this.redeemCodesService.cleanup(dto.retentionDays ?? 30, operator.id); }
  @Post(':id/revoke') revoke(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() operator: { id: string }) { return this.redeemCodesService.revoke(id, operator.id); }
  @Delete(':id') softDelete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() operator: { id: string }) { return this.redeemCodesService.softDelete([id], operator.id); }
  @Post(':id/restore') restore(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() operator: { id: string }) { return this.redeemCodesService.restore(id, operator.id); }
}

@ApiTags('user')
@ApiBearerAuth()
@Controller('user/wallet')
export class UserRedeemController {
  constructor(private readonly redeemCodesService: RedeemCodesService) {}
  @Post('redeem') redeem(@CurrentUser() user: { id: string }, @Body() dto: RedeemCodeDto) { return this.redeemCodesService.redeem(user.id, dto.code); }
}
