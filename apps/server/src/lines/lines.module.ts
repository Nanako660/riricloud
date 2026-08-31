import { Module } from '@nestjs/common';
import { AgentGatewayModule } from '../agent-gateway/agent-gateway.module';
import { LinesController } from './lines.controller';
import { LinesService } from './lines.service';

@Module({
  imports: [AgentGatewayModule],
  controllers: [LinesController],
  providers: [LinesService],
  exports: [LinesService]
})
export class LinesModule {}
