import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/roles.decorator';
import { QueryTrafficDto, TRAFFIC_RANGES } from './dto/traffic.dto';
import { TrafficService } from './traffic.service';

@ApiTags('admin-traffic')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/traffic')
export class TrafficController {
  constructor(private readonly trafficService: TrafficService) {}

  @Get('overview')
  @ApiOperation({ summary: '获取全站流量统计' })
  @ApiQuery({ name: 'range', required: false, enum: TRAFFIC_RANGES, description: '时间范围' })
  @ApiOkResponse({ description: '全站流量汇总、时序和线路排行' })
  getOverview(@Query() query: QueryTrafficDto) {
    return this.trafficService.getOverview(query.range);
  }

  @Get('users/:userId')
  @ApiOperation({ summary: '获取用户流量明细' })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiQuery({ name: 'range', required: false, enum: TRAFFIC_RANGES, description: '时间范围' })
  @ApiOkResponse({ description: '用户配额画像、时序和线路消耗明细' })
  getUserDetail(@Param('userId', ParseUUIDPipe) userId: string, @Query() query: QueryTrafficDto) {
    return this.trafficService.getUserDetail(userId, query.range);
  }
}
