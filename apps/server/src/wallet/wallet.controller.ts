import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { WalletService } from './wallet.service';

// WalletController deliberately owns wallet reads only; code redemption is routed via RedeemCodesService.
@ApiTags('user')
@ApiBearerAuth()
@Controller('user/wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  get(@CurrentUser() user: { id: string }) {
    return this.walletService.getWallet(user.id);
  }

  @Get('transactions')
  transactions(@CurrentUser() user: { id: string }, @Query() query: QueryTransactionsDto) {
    return this.walletService.listTransactions(user.id, query);
  }
}
