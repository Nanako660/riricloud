import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient as TelemetryClient } from '@prisma/telemetry-client';

function resolveTelemetryDatabaseUrl(): string | undefined {
  if (process.env.TELEMETRY_DATABASE_URL) {
    return process.env.TELEMETRY_DATABASE_URL;
  }
  const mainUrl = process.env.DATABASE_URL;
  if (!mainUrl) return undefined;
  if (mainUrl.includes('/riri.db')) {
    return mainUrl.replace('/riri.db', '/telemetry.db');
  }
  if (mainUrl.includes('/dev.db') || mainUrl.endsWith('dev.db')) {
    return mainUrl.replace('dev.db', 'dev-telemetry.db');
  }
  return undefined;
}

@Injectable()
export class TelemetryPrismaService extends TelemetryClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelemetryPrismaService.name);

  constructor() {
    const url = resolveTelemetryDatabaseUrl();
    super(url ? { datasources: { db: { url } } } : undefined);
  }

  async onModuleInit() {
    await this.$connect();
    try {
      await this.$queryRawUnsafe('PRAGMA journal_mode = WAL');
      await this.$queryRawUnsafe('PRAGMA busy_timeout = 10000');
      this.logger.log('Telemetry SQLite WAL mode and busy timeout initialized');
    } catch (err) {
      this.logger.warn(`Telemetry SQLite runtime tuning failed: ${err}`);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
