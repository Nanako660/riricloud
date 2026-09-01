import { Module } from '@nestjs/common';
import { BinariesController } from './binaries.controller';
import { BinariesService } from './binaries.service';
import { SystemModule } from '../system/system.module';

@Module({
  imports: [SystemModule],
  controllers: [BinariesController],
  providers: [BinariesService],
  exports: [BinariesService]
})
export class BinariesModule {}
