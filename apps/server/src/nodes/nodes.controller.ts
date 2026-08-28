import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { CreateNodeDto } from './dto/create-node.dto';
import { NodesService } from './nodes.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@UseGuards(RolesGuard)
@Controller('admin/nodes')
export class NodesController {
  constructor(private readonly nodesService: NodesService) {}

  @Get()
  list() {
    return this.nodesService.list();
  }

  @Post()
  create(@Body() dto: CreateNodeDto, @CurrentUser() user: { id: string }) {
    return this.nodesService.create(dto, user.id);
  }

  @Post(':id/reload')
  reload(@Param('id') id: string) {
    return this.nodesService.requestReload(id);
  }
}
