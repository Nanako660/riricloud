import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { SystemModule } from './system/system.module';
import { UsersModule } from './users/users.module';
import { NodesModule } from './nodes/nodes.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { RolesGuard } from './common/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    SystemModule,
    UsersModule,
    NodesModule,
    SubscriptionModule
  ],
  providers: [{ provide: APP_GUARD, useClass: RolesGuard }]
})
export class AppModule {}
