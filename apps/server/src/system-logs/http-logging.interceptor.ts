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
import { resolveClientIp } from '../common/auth-security';

const IGNORED_PATHS = [
  '/api/v1/logs/stream',
  '/api/v1/logs/frontend',
  '/api/docs'
];

/**
 * 判断是否为高频低噪路径（探活、Agent 轮询、客户端订阅拉取、线路测速等）
 * 成功请求（< 400）静默跳过，异常错误（>= 400）100% 记录以备排查
 */
export function isHighFrequencySilentPath(path: string): boolean {
  return (
    path === '/health' ||
    path.startsWith('/health/') ||
    path === '/ping' ||
    path.startsWith('/ping/') ||
    path === '/api/v1/health' ||
    path.startsWith('/api/v1/health/') ||
    path === '/api/v1/ping' ||
    path.startsWith('/api/v1/ping/') ||
    path === '/api/v1/agent/poll' ||
    path.startsWith('/api/v1/agent/poll?') ||
    path === '/agent/poll' ||
    path.startsWith('/agent/poll?') ||
    path.startsWith('/sub/') ||
    path.startsWith('/api/v1/sub/') ||
    path.startsWith('/api/v1/admin/lines/speedtest') ||
    path.startsWith('/api/v1/lines/speedtest')
  );
}

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

    // 忽略推流端点与文档，防止日志自循环死锁
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
    const forwardedFor = req.headers['x-forwarded-for'];
    const clientIp = resolveClientIp(req.ip || req.socket?.remoteAddress, typeof forwardedFor === 'string' ? forwardedFor : undefined);
    const userAgent = req.headers['user-agent'] || '';

    const logRecord = (statusCode: number, err?: unknown) => {
      // 避免自查 GET /api/v1/logs* 请求在正常成功（< 400）时自我产生刷屏访问日志
      if (req.method === 'GET' && path.startsWith('/api/v1/logs') && statusCode < 400) {
        return;
      }

      // 高频探活、轮询、订阅拉取与测速在正常成功（< 400）时静默跳过，异常（>= 400）100% 入库供排查
      if (statusCode < 400 && isHighFrequencySilentPath(path)) {
        return;
      }

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
