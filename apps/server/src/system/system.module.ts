import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';
import { RateLimitService } from '../common/rate-limit.service';

@Module({
  controllers: [SystemController, SettingsController],
  providers: [SystemService, SettingsService, RateLimitService],
  exports: [SettingsService, RateLimitService]
})
export class SystemModule {}
