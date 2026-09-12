import { Module } from '@nestjs/common';
import { AgentGatewayModule } from '../agent-gateway/agent-gateway.module';
import { PlansModule } from '../plans/plans.module';
import { LinesModule } from '../lines/lines.module';
import { SystemModule } from '../system/system.module';
import { AdminSubscriptionController } from './admin-subscription.controller';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { UserSubscriptionController } from './user-subscription.controller';
import { WalletModule } from '../wallet/wallet.module';
import { PlanPurchasesService } from './plan-purchases.service';

@Module({
  imports: [AgentGatewayModule, PlansModule, LinesModule, SystemModule, WalletModule],
  controllers: [SubscriptionController, UserSubscriptionController, AdminSubscriptionController],
  providers: [SubscriptionService, PlanPurchasesService],
  exports: [SubscriptionService, PlanPurchasesService]
})
export class SubscriptionModule {}
