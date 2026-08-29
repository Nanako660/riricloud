import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { SystemModule } from './system/system.module';
import { UsersModule } from './users/users.module';
import { NodesModule } from './nodes/nodes.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { AgentGatewayModule } from './agent-gateway/agent-gateway.module';

// Web 静态托管在 main.ts 以中间件方式注册（@nestjs/serve-static 与 Express 5 不兼容）
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
