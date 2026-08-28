import { Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { UsersService } from './users.service';

@ApiTags('user')
@ApiBearerAuth()
@Controller('user')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('dashboard')
  getDashboard(@CurrentUser() user: { id: string }) {
    return this.usersService.getDashboard(user.id);
  }

  @Get('nodes')
  getNodes(@CurrentUser() user: { id: string }) {
    return this.usersService.getAvailableNodes(user.id);
  }

  // 重置订阅令牌（防订阅泄漏；旧链接立即失效）
  @Post('reset-sub')
  async resetSubscriptionToken(@CurrentUser() user: { id: string }) {
    const subscriptionToken = await this.usersService.resetSubscriptionToken(user.id);
    return { subscriptionToken };
  }
}
