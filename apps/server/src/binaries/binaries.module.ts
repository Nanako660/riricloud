import { Module } from '@nestjs/common';
import { BinariesController } from './binaries.controller';
import { BinariesService } from './binaries.service';

@Module({
  controllers: [BinariesController],
  providers: [BinariesService],
  exports: [BinariesService]
})
export class BinariesModule {}
