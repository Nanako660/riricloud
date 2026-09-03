import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { RedeemCodeDto } from './dto/redeem-code.dto';
import { WalletService } from './wallet.service';

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

  @Post('redeem')
  redeem(@CurrentUser() user: { id: string }, @Body() dto: RedeemCodeDto) {
    return this.walletService.redeem(user.id, dto.code);
  }
}
