import { Module } from '@nestjs/common';
import { TrafficController } from './traffic.controller';
import { TrafficService } from './traffic.service';
import { TrafficCleanupService } from './traffic-cleanup.service';
import { SystemModule } from '../system/system.module';

@Module({
  imports: [SystemModule],
  controllers: [TrafficController],
  providers: [TrafficService, TrafficCleanupService],
  exports: [TrafficService, TrafficCleanupService]
})
export class TrafficModule {}
