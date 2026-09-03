import { Module } from '@nestjs/common';
import { AgentGatewayModule } from '../agent-gateway/agent-gateway.module';
import { SystemModule } from '../system/system.module';
import { LinesModule } from '../lines/lines.module';
import { WalletModule } from '../wallet/wallet.module';
import { UsersAdminController } from './users-admin.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AgentGatewayModule, SystemModule, LinesModule, WalletModule],
  controllers: [UsersController, UsersAdminController],
  providers: [UsersService],
  exports: [UsersService]
})
export class UsersModule {}
