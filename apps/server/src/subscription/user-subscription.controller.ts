import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { SubscribePlanDto } from './dto/subscribe-plan.dto';
import { UpgradeSubscriptionDto } from './dto/upgrade-subscription.dto';
import { SubscriptionService } from './subscription.service';

@ApiTags('user')
@ApiBearerAuth()
@Controller('user/subscription')
export class UserSubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get()
  get(@CurrentUser() user: { id: string }) {
    return this.subscriptionService.getForUser(user.id);
  }

  @Post()
  subscribe(@CurrentUser() user: { id: string }, @Body() dto: SubscribePlanDto) {
    return this.subscriptionService.subscribe(user.id, dto.planId);
  }

  @Post('upgrade')
  upgrade(@CurrentUser() user: { id: string }, @Body() dto: UpgradeSubscriptionDto) {
    return this.subscriptionService.upgrade(user.id, dto.planId);
  }

  @Post('renew')
  renew(@CurrentUser() user: { id: string }) {
    return this.subscriptionService.renew(user.id);
  }

  @Post('cancel')
  cancel(@CurrentUser() user: { id: string }) {
    return this.subscriptionService.cancel(user.id);
  }

  @Post('reset-token')
  resetToken(@CurrentUser() user: { id: string }) {
    return this.subscriptionService.resetToken(user.id);
  }
}
