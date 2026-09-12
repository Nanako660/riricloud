import { Module } from '@nestjs/common';
import { SystemLogsModule } from '../system-logs/system-logs.module';
import { WalletModule } from '../wallet/wallet.module';
import { RedeemCodesController } from './redeem-codes.controller';
import { RedeemCodesService } from './redeem-codes.service';

@Module({
  imports: [WalletModule, SystemLogsModule],
  controllers: [RedeemCodesController],
  providers: [RedeemCodesService]
})
export class RedeemCodesModule {}
