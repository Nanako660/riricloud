import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { CreateNodeDto } from './dto/create-node.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import { ProbeNodeDto } from './dto/probe-node.dto';
import { UpgradeNodeDto } from './dto/upgrade-node.dto';
import { NodesService } from './nodes.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/nodes')
export class NodesController {
  constructor(private readonly nodesService: NodesService) {}

  @Get()
  list() {
    return this.nodesService.list();
  }

  // 注意：/:id 之前注册，避免 reality-keypair 被当作节点 id
  @Post('reality-keypair')
  generateRealityKeypair() {
    return this.nodesService.realityKeypair();
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.nodesService.detail(id);
  }

  @Post()
  create(@Body() dto: CreateNodeDto, @CurrentUser() user: { id: string }) {
    return this.nodesService.create(dto, user.id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateNodeDto) {
    return this.nodesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.nodesService.remove(id);
  }

  @Post(':id/reload')
  reload(@Param('id') id: string) {
    return this.nodesService.requestReload(id);
  }

  @Post(':id/upgrade')
  upgrade(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpgradeNodeDto) {
    return this.nodesService.requestUpgrade(id, dto);
  }

  @Post(':id/probe')
  probe(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ProbeNodeDto) {
    return this.nodesService.requestProbe(id, dto);
  }

}
