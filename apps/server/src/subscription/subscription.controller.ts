import { Controller, Get, Headers, Param, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { SubscriptionService } from './subscription.service';

@ApiTags('subscription')
@Public()
@Controller('sub')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  // 订阅端点：格式协商规则见 docs/API_AND_PROTOCOLS.md §3.1；UserInfo/更新间隔头全格式返回
  @Get(':token')
  async getSubscription(
    @Param('token') token: string,
    @Query('type') type: string | undefined,
    @Query('templateId') templateId: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.subscriptionService.getSubscription(token, { type, templateId, userAgent });
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Profile-Update-Interval', String(result.updateIntervalHours));
    if (result.userInfoHeader) res.setHeader('Subscription-Userinfo', result.userInfoHeader);
    return result.body;
  }
}
