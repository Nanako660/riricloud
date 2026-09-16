import { Global, Module } from '@nestjs/common';
import { TelemetryPrismaService } from './telemetry-prisma.service';

@Global()
@Module({
  providers: [TelemetryPrismaService],
  exports: [TelemetryPrismaService]
})
export class TelemetryPrismaModule {}
