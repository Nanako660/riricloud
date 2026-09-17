import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module';
import { TelemetryPrismaModule } from '../prisma/telemetry-prisma.module';
import { SystemModule } from '../system/system.module';
import { HttpLoggingInterceptor } from './http-logging.interceptor';
import { SSEHubService } from './sse-hub.service';
import { SseTicketService } from './sse-ticket.service';
import { SystemLogsCleanupService } from './system-logs-cleanup.service';
import { SystemLogsController } from './system-logs.controller';
import { SystemLogsService } from './system-logs.service';
import { AuthAuditService } from '../common/auth-audit.service';
import { TelemetryCleanupController } from './telemetry-cleanup.controller';
import { TelemetryCleanupService } from './telemetry-cleanup.service';

@Module({
  imports: [PrismaModule, TelemetryPrismaModule, SystemModule],
  controllers: [SystemLogsController, TelemetryCleanupController],
  providers: [
    SystemLogsService,
    AuthAuditService,
    SSEHubService,
    SseTicketService,
    SystemLogsCleanupService,
    TelemetryCleanupService,
    HttpLoggingInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor
    }
  ],
  exports: [SystemLogsService, AuthAuditService, SSEHubService, SseTicketService, TelemetryCleanupService]
})
export class SystemLogsModule {}
