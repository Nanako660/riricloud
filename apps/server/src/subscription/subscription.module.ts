import { Module } from '@nestjs/common';
import { AgentGatewayModule } from '../agent-gateway/agent-gateway.module';
import { PlansModule } from '../plans/plans.module';
import { AdminSubscriptionController } from './admin-subscription.controller';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { UserSubscriptionController } from './user-subscription.controller';

@Module({
  imports: [AgentGatewayModule, PlansModule],
  controllers: [SubscriptionController, UserSubscriptionController, AdminSubscriptionController],
  providers: [SubscriptionService],
  exports: [SubscriptionService]
})
export class SubscriptionModule {}
