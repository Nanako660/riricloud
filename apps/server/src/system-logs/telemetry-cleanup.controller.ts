import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { TelemetryCleanupDto } from './dto/telemetry-cleanup.dto';
import { TelemetryCleanupService } from './telemetry-cleanup.service';

@ApiTags('telemetry-cleanup')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/telemetry/cleanup')
export class TelemetryCleanupController {
  constructor(private readonly cleanupService: TelemetryCleanupService) {}

  @Post('preview')
  @ApiOperation({ summary: '预览历史遥测数据清理范围' })
  preview(@Body() dto: TelemetryCleanupDto) {
    return this.cleanupService.preview(dto);
  }

  @Post()
  @ApiOperation({ summary: '执行历史遥测数据清理' })
  execute(
    @Body() dto: TelemetryCleanupDto,
    @CurrentUser() user: { id: string; role?: string },
    @Req() req: Request & { traceId?: string }
  ) {
    return this.cleanupService.execute(dto, { id: user.id, role: user.role, traceId: req.traceId });
  }
}
