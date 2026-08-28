import { Module, OnModuleInit } from '@nestjs/common';
import { AgentGateway } from './agent.gateway';
import { AgentGatewayService } from './agent-gateway.service';
import { AgentSweepService } from './agent-sweep.service';

@Module({
  providers: [AgentGateway, AgentGatewayService, AgentSweepService],
  exports: [AgentGatewayService]
})
export class AgentGatewayModule implements OnModuleInit {
  constructor(private readonly sweep: AgentSweepService) {}

  onModuleInit() {
    this.sweep.start();
  }
}
