import { Controller, Get, Header, Headers, Param, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { SubscriptionService } from './subscription.service';

@ApiTags('subscription')
@Public()
@Controller('sub')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  // 订阅端点：默认输出 Base64 URI 列表；Clash/Sing-box 格式待后续版本（见 ROADMAP）
  @Get(':token')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Profile-Update-Interval', '24')
  async getSubscription(
    @Param('token') token: string,
    @Headers() headers: Record<string, string>,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.subscriptionService.getSubscription(token, headers['user-agent']);
    res.setHeader('Subscription-Userinfo', result.userInfoHeader);
    return result.body;
  }
}
