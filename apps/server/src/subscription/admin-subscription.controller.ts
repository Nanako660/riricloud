import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/roles.decorator';
import { AdminUpdateSubDto } from './dto/admin-update-subscription.dto';
import { QuerySubscriptionDto } from './dto/query-subscription.dto';
import { SubscriptionService } from './subscription.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/subscriptions')
export class AdminSubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get()
  list(@Query() query: QuerySubscriptionDto) {
    return this.subscriptionService.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.subscriptionService.get(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminUpdateSubDto) {
    return this.subscriptionService.adminUpdate(id, dto);
  }

  @Post(':id/reset-token')
  resetToken(@Param('id', ParseUUIDPipe) id: string) {
    return this.subscriptionService.resetTokenBySubscription(id);
  }
}
