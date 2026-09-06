import { Injectable, Optional } from '@nestjs/common';
import { hashAuthValue } from './auth-security';
import { SystemLogsService } from '../system-logs/system-logs.service';

export type AuthAuditEvent =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'LOGIN_RATE_LIMITED'
  | 'REGISTER_SUCCESS'
  | 'REGISTER_FAILURE'
  | 'REGISTER_RATE_LIMITED'
  | 'PASSWORD_RESET_SUCCESS'
  | 'PASSWORD_RESET_FAILURE'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_CHANGE_FAILURE'
  | 'LOGOUT'
  | 'SESSION_INVALIDATED'
  | 'ACCOUNT_DISABLED'
  | 'VERIFICATION_SENT'
  | 'VERIFICATION_SEND_FAILURE'
  | 'VERIFICATION_RATE_LIMITED'
  | 'VERIFICATION_CONSUMED'
  | 'VERIFICATION_FAILURE'
  | 'CAPTCHA_VERIFIED'
  | 'CAPTCHA_FAILURE'
  | 'ADMIN_USER_CREATED'
  | 'ADMIN_PASSWORD_CHANGED';

const FAILURE_EVENTS = new Set<AuthAuditEvent>([
  'LOGIN_FAILURE',
  'LOGIN_RATE_LIMITED',
  'REGISTER_FAILURE',
  'REGISTER_RATE_LIMITED',
  'PASSWORD_RESET_FAILURE',
  'PASSWORD_CHANGE_FAILURE',
  'VERIFICATION_SEND_FAILURE',
  'VERIFICATION_RATE_LIMITED',
  'VERIFICATION_FAILURE',
  'CAPTCHA_FAILURE'
]);

@Injectable()
export class AuthAuditService {
  constructor(@Optional() private readonly systemLogsService?: SystemLogsService) {}

  record(event: AuthAuditEvent, metadata: Record<string, unknown> = {}, userId?: string | null): void {
    try {
      this.systemLogsService?.enqueue({
        source: 'SERVER',
        level: FAILURE_EVENTS.has(event) ? 'WARN' : 'INFO',
        module: 'AUTH',
        message: `auth event: ${event}`,
        metadata: { event, ...metadata },
        userId: userId ?? null
      });
    } catch {
      // 审计日志故障不得阻断认证主流程。
    }
  }

  emailHash(email: string): string {
    return hashAuthValue('auth-audit-email', email.trim().toLowerCase());
  }
}
