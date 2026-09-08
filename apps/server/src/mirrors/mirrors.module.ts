import { Module } from '@nestjs/common';
import { AgentGatewayModule } from '../agent-gateway/agent-gateway.module';
import { SystemModule } from '../system/system.module';
import { MirrorPublicController } from './mirror-public.controller';
import { MirrorsController } from './mirrors.controller';
import { MirrorService } from './mirror.service';

@Module({
  imports: [AgentGatewayModule, SystemModule],
  controllers: [MirrorsController, MirrorPublicController],
  providers: [MirrorService]
})
export class MirrorsModule {}
