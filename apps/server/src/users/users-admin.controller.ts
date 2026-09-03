import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users.query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AdjustBalanceDto } from './dto/adjust-balance.dto';
import { UsersService } from './users.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/users')
export class UsersAdminController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  list(@Query() query: ListUsersQueryDto) {
    return this.usersService.listUsers(query);
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.usersService.createUser(dto);
  }

  @Post(':id/reset-subscription-token')
  async resetSubscriptionToken(@Param('id', ParseUUIDPipe) id: string) {
    const subscriptionToken = await this.usersService.resetSubscriptionToken(id);
    return { subscriptionToken };
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() operator: { id: string }
  ) {
    return this.usersService.updateUser(id, dto, operator.id);
  }

  @Post(':id/adjust-balance')
  adjustBalance(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdjustBalanceDto) {
    return this.usersService.adjustBalance(id, dto.amount, dto.description);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() operator: { id: string }) {
    return this.usersService.deleteUser(id, operator.id);
  }
}
