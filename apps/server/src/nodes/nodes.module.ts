import { Module } from '@nestjs/common';
import { AgentGatewayModule } from '../agent-gateway/agent-gateway.module';
import { NodesController } from './nodes.controller';
import { NodesService } from './nodes.service';
import { LinesModule } from '../lines/lines.module';

@Module({
  imports: [AgentGatewayModule, LinesModule],
  controllers: [NodesController],
  providers: [NodesService],
  exports: [NodesService]
})
export class NodesModule {}
