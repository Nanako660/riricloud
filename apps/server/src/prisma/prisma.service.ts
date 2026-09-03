import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// 全局唯一 PrismaClient 实例（分层约束见 docs/CODE_REVIEW.md §3.1）
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    try {
      await this.$queryRawUnsafe('PRAGMA journal_mode = WAL');
      await this.$queryRawUnsafe('PRAGMA busy_timeout = 10000');
      this.logger.log('SQLite WAL mode and busy timeout initialized');
    } catch (err) {
      this.logger.warn(`SQLite runtime tuning failed: ${err}`);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
