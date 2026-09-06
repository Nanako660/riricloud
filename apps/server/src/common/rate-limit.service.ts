import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';

type Counter = { count: number; resetAt: number };

const MAX_COUNTERS = 10_000;

@Injectable()
export class RateLimitService implements OnModuleInit, OnModuleDestroy {
  private readonly counters = new Map<string, Counter>();
  private cleanupTimer?: NodeJS.Timeout;

  onModuleInit(): void {
    this.cleanupTimer = setInterval(() => this.clearExpired(), 5 * 60_000);
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  consume(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const safeKey = this.keyForStorage(key);
    const current = this.counters.get(safeKey);
    if (!current || current.resetAt <= now) {
      this.ensureCapacity(now);
      this.counters.set(safeKey, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (current.count >= limit) return false;
    current.count += 1;
    return true;
  }

  clearExpired(now = Date.now()): void {
    for (const [key, counter] of this.counters) {
      if (counter.resetAt <= now) this.counters.delete(key);
    }
  }

  get size(): number {
    return this.counters.size;
  }

  private ensureCapacity(now: number): void {
    this.clearExpired(now);
    if (this.counters.size < MAX_COUNTERS) return;
    const oldest = this.counters.keys().next().value as string | undefined;
    if (oldest) this.counters.delete(oldest);
  }

  private keyForStorage(key: string): string {
    return createHash('sha256').update(key.slice(0, 1024), 'utf8').digest('hex');
  }
}
