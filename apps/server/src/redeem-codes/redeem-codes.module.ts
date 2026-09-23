import { Module } from '@nestjs/common';
import { SystemLogsModule } from '../system-logs/system-logs.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { WalletModule } from '../wallet/wallet.module';
import { RedeemCodesController, UserRedeemController } from './redeem-codes.controller';
import { RedeemCodesService } from './redeem-codes.service';

@Module({
  imports: [WalletModule, SubscriptionModule, SystemLogsModule],
  controllers: [RedeemCodesController, UserRedeemController],
  providers: [RedeemCodesService]
})
export class RedeemCodesModule {}
