import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { getRequestBaseUrl } from '../common/public-url';
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
  detail(@Param('id', ParseUUIDPipe) id: string, @Req() request: Request) {
    return this.nodesService.detail(id, getRequestBaseUrl(request));
  }

  @Post()
  create(@Body() dto: CreateNodeDto, @CurrentUser() user: { id: string }, @Req() request: Request) {
    return this.nodesService.create(dto, user.id, getRequestBaseUrl(request));
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

  @Post(':id/rotate-token')
  rotateToken(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }) {
    return this.nodesService.rotateToken(id, user.id);
  }

  @Post(':id/upgrade')
  upgrade(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpgradeNodeDto, @CurrentUser() user: { id: string }, @Req() request: Request) {
    return this.nodesService.requestUpgrade(id, dto, getRequestBaseUrl(request), user.id);
  }

  @Post(':id/probe')
  probe(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ProbeNodeDto) {
    return this.nodesService.requestProbe(id, dto);
  }

  @Post(':id/restart-agent')
  restartAgent(@Param('id', ParseUUIDPipe) id: string) {
    return this.nodesService.requestRestart(id);
  }

  @Get(':id/tasks/:taskId')
  taskStatus(@Param('id', ParseUUIDPipe) id: string, @Param('taskId', ParseUUIDPipe) taskId: string) {
    return this.nodesService.taskStatus(id, taskId);
  }

  @Post(':id/tasks/:taskId/retry')
  retryTask(@Param('id', ParseUUIDPipe) id: string, @Param('taskId', ParseUUIDPipe) taskId: string, @CurrentUser() user: { id: string }) {
    return this.nodesService.retryUpgrade(id, taskId, user.id);
  }

  @Post(':id/tasks/:taskId/rollback')
  rollbackTask(@Param('id', ParseUUIDPipe) id: string, @Param('taskId', ParseUUIDPipe) taskId: string, @CurrentUser() user: { id: string }, @Req() request: Request) {
    return this.nodesService.rollbackUpgrade(id, taskId, getRequestBaseUrl(request), user.id);
  }

}
