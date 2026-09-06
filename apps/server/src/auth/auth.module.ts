import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AgentGatewayModule } from '../agent-gateway/agent-gateway.module';
import { SystemModule } from '../system/system.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { WalletModule } from '../wallet/wallet.module';
import { CaptchaModule } from '../captcha/captcha.module';
import { VerificationModule } from '../verification/verification.module';
import { SystemLogsModule } from '../system-logs/system-logs.module';
import { getJwtSecret } from '../common/runtime-config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule,
    AgentGatewayModule,
    SystemModule,
    SubscriptionModule,
    WalletModule,
    CaptchaModule,
    VerificationModule,
    SystemLogsModule,
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '12h' }
    })
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule]
})
export class AuthModule {}
