import { Module } from '@nestjs/common';
import { AgentGatewayModule } from '../agent-gateway/agent-gateway.module';
import { SystemModule } from '../system/system.module';
import { LinesModule } from '../lines/lines.module';
import { WalletModule } from '../wallet/wallet.module';
import { VerificationModule } from '../verification/verification.module';
import { UsersAdminController } from './users-admin.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserIdentityService } from './user-identity.service';

@Module({
  imports: [AgentGatewayModule, SystemModule, LinesModule, WalletModule, VerificationModule],
  controllers: [UsersController, UsersAdminController],
  providers: [UsersService, UserIdentityService],
  exports: [UsersService]
})
export class UsersModule {}
