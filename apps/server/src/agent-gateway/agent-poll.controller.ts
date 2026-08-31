import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { AgentService } from './agent.service';
import { AgentPollDto } from './dto/agent-poll.dto';

// HTTP 轮询传输适配器：鉴权、业务处理与任务队列均委托给 AgentService。
@ApiTags('agent')
@Public()
@Controller('agent')
export class AgentPollController {
  constructor(private readonly agentService: AgentService) {}

  @Post('poll')
  poll(@Headers('x-agent-token') token: string | undefined, @Body() dto: AgentPollDto) {
    return this.agentService.poll(token, dto);
  }
}
