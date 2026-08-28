import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { SystemModule } from './system/system.module';
import { UsersModule } from './users/users.module';
import { NodesModule } from './nodes/nodes.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { AgentGatewayModule } from './agent-gateway/agent-gateway.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    SystemModule,
    UsersModule,
    NodesModule,
    SubscriptionModule,
    AgentGatewayModule
  ]
})
export class AppModule {}
