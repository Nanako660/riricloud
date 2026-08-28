import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

@Module({
  controllers: [SystemController, SettingsController],
  providers: [SystemService, SettingsService],
  exports: [SettingsService]
})
export class SystemModule {}
