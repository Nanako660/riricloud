import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { sanitizeLogMetadata } from './masking.util';
import { SystemLogsService } from './system-logs.service';

const IGNORED_PATHS = [
  '/api/v1/logs/stream',
  '/api/v1/logs/frontend',
  '/api/docs',
  '/health'
];

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(private readonly systemLogsService: SystemLogsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpCtx = context.switchToHttp();
    const req = httpCtx.getRequest<Request & { user?: { id?: string }; traceId?: string }>();
    const res = httpCtx.getResponse<Response>();

    if (!req || !res || !req.url) {
      return next.handle();
    }

    const path = req.originalUrl || req.url;

    // 忽略推流端点与高频探活，防止日志自循环死锁
    if (IGNORED_PATHS.some((ignored) => path.startsWith(ignored))) {
      return next.handle();
    }

    // 提取或生成全链路 TraceId
    const incomingTraceId = req.headers['x-request-id'];
    const traceId = typeof incomingTraceId === 'string' && incomingTraceId.trim()
      ? incomingTraceId.trim()
      : randomUUID();

    req.traceId = traceId;
    if (typeof res.setHeader === 'function') {
      res.setHeader('X-Request-Id', traceId);
    }

    const startTime = Date.now();
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.ip || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || '';

    const logRecord = (statusCode: number, err?: unknown) => {
      const durationMs = Date.now() - startTime;
      let level: 'INFO' | 'WARN' | 'ERROR' = 'INFO';
      if (statusCode >= 500) {
        level = 'ERROR';
      } else if (statusCode >= 400) {
        level = 'WARN';
      }

      const metadata: Record<string, unknown> = {
        method: req.method,
        path,
        statusCode,
        durationMs,
        clientIp,
        userAgent,
        userId: req.user?.id || null
      };

      if (err) {
        metadata.errorMessage = err instanceof Error ? err.message : String(err);
        metadata.errorStack = err instanceof Error ? err.stack : undefined;
      }

      this.systemLogsService.enqueue({
        traceId,
        source: 'SERVER',
        level,
        module: 'HTTP',
        message: `${req.method} ${path} -> ${statusCode} (${durationMs}ms)`,
        metadata: sanitizeLogMetadata(metadata),
        userId: req.user?.id || null
      });
    };

    return next.handle().pipe(
      tap(() => {
        logRecord(res.statusCode || 200);
      }),
      catchError((err) => {
        const status = err instanceof HttpException ? err.getStatus() : 500;
        logRecord(status, err);
        return throwError(() => err);
      })
    );
  }
}
