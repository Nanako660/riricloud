import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { SystemModule } from './system/system.module';
import { UsersModule } from './users/users.module';
import { NodesModule } from './nodes/nodes.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { AgentGatewayModule } from './agent-gateway/agent-gateway.module';
import { PlansModule } from './plans/plans.module';
import { TemplatesModule } from './subscription-templates/templates.module';
import { LinesModule } from './lines/lines.module';
import { BinariesModule } from './binaries/binaries.module';

// Web 静态托管在 main.ts 以中间件方式注册（@nestjs/serve-static 与 Express 5 不兼容）
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    SystemModule,
    UsersModule,
    NodesModule,
    LinesModule,
    PlansModule,
    TemplatesModule,
    SubscriptionModule,
    AgentGatewayModule,
    BinariesModule
  ]
})
export class AppModule {}
