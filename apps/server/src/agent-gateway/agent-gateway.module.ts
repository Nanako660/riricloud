import { Module, OnModuleInit } from '@nestjs/common';
import { AgentGateway } from './agent.gateway';
import { AgentService } from './agent.service';
import { AgentSweepService } from './agent-sweep.service';
import { AgentPollController } from './agent-poll.controller';

@Module({
  controllers: [AgentPollController],
  providers: [AgentGateway, AgentService, AgentSweepService],
  exports: [AgentService]
})
export class AgentGatewayModule implements OnModuleInit {
  constructor(private readonly sweep: AgentSweepService) {}

  onModuleInit() {
    this.sweep.start();
  }
}
