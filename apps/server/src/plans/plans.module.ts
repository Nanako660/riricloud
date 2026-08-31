import { Module } from '@nestjs/common';
import { PlansController } from './plans.controller';
import { PublicPlansController } from './public-plans.controller';
import { PlansService } from './plans.service';
import { LinesModule } from '../lines/lines.module';

@Module({
  imports: [LinesModule],
  controllers: [PlansController, PublicPlansController],
  providers: [PlansService],
  exports: [PlansService]
})
export class PlansModule {}
