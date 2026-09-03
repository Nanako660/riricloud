import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/roles.decorator';
import { BatchRedeemCodesDto } from './dto/batch-redeem-codes.dto';
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

  @Post('batch')
  batch(@Body() dto: BatchRedeemCodesDto) {
    return this.redeemCodesService.batchCreate(dto);
  }

  @Post(':id/revoke')
  revoke(@Param('id', ParseUUIDPipe) id: string) {
    return this.redeemCodesService.revoke(id);
  }
}
