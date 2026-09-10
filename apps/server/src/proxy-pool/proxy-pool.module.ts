import { Module } from '@nestjs/common';
import { AgentGatewayModule } from '../agent-gateway/agent-gateway.module';
import { AdminProxyPoolController } from './admin-proxy-pool.controller';
import { ProxyPoolService } from './proxy-pool.service';
import { UserProxyPoolController } from './user-proxy-pool.controller';

@Module({
  imports: [AgentGatewayModule],
  controllers: [UserProxyPoolController, AdminProxyPoolController],
  providers: [ProxyPoolService],
  exports: [ProxyPoolService]
})
export class ProxyPoolModule {}
