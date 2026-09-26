import { Module } from '@nestjs/common';
import { BinariesController } from './binaries.controller';
import { BinariesService } from './binaries.service';
import { BinariesInstallerService } from './installer.service';
import { BinaryResourcesService } from './binary-resources.service';
import { OfflinePackageService } from './offline-package.service';
import { SystemModule } from '../system/system.module';
import { SystemLogsModule } from '../system-logs/system-logs.module';

@Module({
  imports: [SystemModule, SystemLogsModule],
  controllers: [BinariesController],
  providers: [BinariesService, BinaryResourcesService, BinariesInstallerService, OfflinePackageService],
  exports: [BinariesService, BinaryResourcesService, BinariesInstallerService, OfflinePackageService]
})
export class BinariesModule {}

