import { Module } from '@nestjs/common';
import { AgentGatewayModule } from '../agent-gateway/agent-gateway.module';
import { CertificatesController } from './certificates.controller';
import { CertificatesService } from './certificates.service';

@Module({
  imports: [AgentGatewayModule],
  controllers: [CertificatesController],
  providers: [CertificatesService],
  exports: [CertificatesService]
})
export class CertificatesModule {}
