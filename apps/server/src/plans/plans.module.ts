import { Module } from '@nestjs/common';
import { PlansController } from './plans.controller';
import { PublicPlansController } from './public-plans.controller';
import { PlansService } from './plans.service';

@Module({
  controllers: [PlansController, PublicPlansController],
  providers: [PlansService],
  exports: [PlansService]
})
export class PlansModule {}
