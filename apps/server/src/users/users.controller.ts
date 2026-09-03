import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { UsersService } from './users.service';
import { ChangePasswordDto } from './dto/change-password.dto';

@ApiTags('user')
@ApiBearerAuth()
@Controller('user')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * @deprecated 前端统一使用 GET /user/subscription；保留该接口供外部脚本兼容。
   */
  @Get('dashboard')
  @ApiOperation({ summary: '获取个人仪表盘数据（已弃用，请使用 /user/subscription）', deprecated: true })
  getDashboard(@CurrentUser() user: { id: string }) {
    return this.usersService.getDashboard(user.id);
  }

  @Get('lines')
  getLines(@CurrentUser() user: { id: string }) {
    return this.usersService.getAvailableNodes(user.id);
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

  @Post('change-password')
  changePassword(@CurrentUser() user: { id: string }, @Body() dto: ChangePasswordDto) {
    return this.usersService.changePassword(user.id, dto);
  }

  @Post('reset-uuid')
  resetUuid(@CurrentUser() user: { id: string }) {
    return this.usersService.resetUuid(user.id);
  }
}
