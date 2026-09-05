import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  type MessageEvent,
  Post,
  Query,
  Req,
  Res,
  Sse
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { Public } from '../auth/public.decorator';
import { Roles } from '../common/roles.decorator';
import { CreateFrontendLogsDto } from './dto/create-frontend-logs.dto';
import { CleanLogsDto, ExportLogsDto, QueryLogsDto } from './dto/query-logs.dto';
import { SSEHubService } from './sse-hub.service';
import { SystemLogsService } from './system-logs.service';

@ApiTags('system-logs')
@Controller('logs')
export class SystemLogsController {
  constructor(
    private readonly logsService: SystemLogsService,
    private readonly sseHub: SSEHubService
  ) {}

  @Get()
  @ApiBearerAuth()
  @Roles('ADMIN')
  @ApiOperation({ summary: '分页查询系统日志' })
  queryLogs(@Query() query: QueryLogsDto) {
    return this.logsService.query(query);
  }

  @Get('metrics')
  @ApiBearerAuth()
  @Roles('ADMIN')
  @ApiOperation({ summary: '获取日志大盘指标统计与趋势' })
  @ApiQuery({ name: 'hours', required: false, type: Number, description: '统计过去多少小时，默认 24' })
  getMetrics(@Query('hours') hours?: string) {
    return this.logsService.getMetrics(hours ? Number(hours) : 24);
  }

  @Sse('stream')
  @ApiBearerAuth()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'SSE 实时日志流推流通道' })
  streamLogs(
    @Query('level') level?: string,
    @Query('source') source?: string,
    @Query('nodeId') nodeId?: string,
    @Query('keyword') keyword?: string
  ): Observable<MessageEvent> {
    return this.sseHub.subscribe({ level, source, nodeId, keyword });
  }

  @Post('frontend')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '前端批量上报异常与关键操作日志' })
  reportFrontendLogs(
    @Body() dto: CreateFrontendLogsDto,
    @Req() req: Request & { user?: { id?: string }; traceId?: string }
  ) {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.ip || req.socket?.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    const userId = req.user?.id || null;
    const reqTraceId = req.traceId || (req.headers['x-request-id'] as string) || null;

    for (const item of dto.logs) {
      this.logsService.enqueue({
        traceId: item.traceId || reqTraceId,
        source: 'WEB',
        level: item.level,
        module: item.module || 'WebClient',
        message: item.message,
        metadata: {
          ...item.metadata,
          clientIp,
          userAgent
        },
        userId
      });
    }
  }

  @Delete()
  @ApiBearerAuth()
  @Roles('ADMIN')
  @ApiOperation({ summary: '按保留策略清理历史日志' })
  @ApiQuery({ name: 'retentionDays', required: false, type: Number, description: '清理多少天之前的日志' })
  @ApiQuery({ name: 'maxRecords', required: false, type: Number, description: '保留最新记录上限，超额清理' })
  cleanLogs(@Query() query: CleanLogsDto) {
    return this.logsService.clean(query.retentionDays, query.maxRecords);
  }

  @Get('export')
  @ApiBearerAuth()
  @Roles('ADMIN')
  @ApiOperation({ summary: '按条件导出日志文件（JSON 或 CSV）' })
  @ApiQuery({ name: 'format', required: false, enum: ['json', 'csv'], description: '导出格式' })
  async exportLogs(
    @Query() query: ExportLogsDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const format = query.format || 'json';
    const data = await this.logsService.export(query, format);
    const filename = `riricloud-logs-${new Date().toISOString().slice(0, 10)}.${format}`;

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    } else {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    }

    return data;
  }
}
