import { Module } from '@nestjs/common';
import { BinariesController } from './binaries.controller';
import { BinariesService } from './binaries.service';
import { BinariesInstallerService } from './installer.service';
import { BinaryResourcesService } from './binary-resources.service';
import { SystemModule } from '../system/system.module';

@Module({
  imports: [SystemModule],
  controllers: [BinariesController],
  providers: [BinariesService, BinaryResourcesService, BinariesInstallerService],
  exports: [BinariesService, BinaryResourcesService]
})
export class BinariesModule {}
