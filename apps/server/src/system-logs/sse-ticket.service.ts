import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';

type Ticket = { userId: string; expiresAt: number };

@Injectable()
export class SseTicketService {
  private readonly tickets = new Map<string, Ticket>();

  issue(userId: string): { ticket: string; expiresAt: string } {
    this.cleanup();
    const ticket = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + 60_000;
    this.tickets.set(this.key(ticket), { userId, expiresAt });
    return { ticket, expiresAt: new Date(expiresAt).toISOString() };
  }

  consume(ticket: string): string | null {
    this.cleanup();
    const key = this.key(ticket);
    const item = this.tickets.get(key);
    if (!item || item.expiresAt <= Date.now()) return null;
    this.tickets.delete(key);
    return item.userId;
  }

  private key(ticket: string): string {
    return createHash('sha256').update(ticket).digest('hex');
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.tickets) {
      if (item.expiresAt <= now) this.tickets.delete(key);
    }
  }
}
