import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { RedeemCodesController } from './redeem-codes.controller';
import { RedeemCodesService } from './redeem-codes.service';

@Module({
  imports: [WalletModule],
  controllers: [RedeemCodesController],
  providers: [RedeemCodesService]
})
export class RedeemCodesModule {}
