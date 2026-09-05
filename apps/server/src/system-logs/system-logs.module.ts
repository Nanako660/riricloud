import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemModule } from '../system/system.module';
import { HttpLoggingInterceptor } from './http-logging.interceptor';
import { SSEHubService } from './sse-hub.service';
import { SystemLogsCleanupService } from './system-logs-cleanup.service';
import { SystemLogsController } from './system-logs.controller';
import { SystemLogsService } from './system-logs.service';

@Module({
  imports: [PrismaModule, SystemModule],
  controllers: [SystemLogsController],
  providers: [
    SystemLogsService,
    SSEHubService,
    SystemLogsCleanupService,
    HttpLoggingInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor
    }
  ],
  exports: [SystemLogsService, SSEHubService]
})
export class SystemLogsModule {}
