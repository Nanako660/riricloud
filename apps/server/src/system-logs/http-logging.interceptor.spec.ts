import { ExecutionContext, HttpException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { HttpLoggingInterceptor, isHighFrequencySilentPath } from './http-logging.interceptor';
import { SystemLogsService } from './system-logs.service';

describe('HttpLoggingInterceptor', () => {
  let interceptor: HttpLoggingInterceptor;
  let mockSystemLogsService: { enqueue: jest.Mock };

  beforeEach(() => {
    mockSystemLogsService = {
      enqueue: jest.fn()
    };
    interceptor = new HttpLoggingInterceptor(mockSystemLogsService as unknown as SystemLogsService);
  });

  const createMockContext = (reqOverrides = {}, resOverrides = {}): ExecutionContext => {
    const req = {
      method: 'GET',
      url: '/api/v1/users',
      originalUrl: '/api/v1/users',
      headers: {},
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      ...reqOverrides
    };
    const res = {
      statusCode: 200,
      setHeader: jest.fn(),
      ...resOverrides
    };

    return {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res
      })
    } as unknown as ExecutionContext;
  };

  describe('isHighFrequencySilentPath', () => {
    it('正确识别高频低噪路径', () => {
      expect(isHighFrequencySilentPath('/health')).toBe(true);
      expect(isHighFrequencySilentPath('/ping')).toBe(true);
      expect(isHighFrequencySilentPath('/api/v1/health')).toBe(true);
      expect(isHighFrequencySilentPath('/api/v1/ping')).toBe(true);
      expect(isHighFrequencySilentPath('/api/v1/agent/poll')).toBe(true);
      expect(isHighFrequencySilentPath('/agent/poll')).toBe(true);
      expect(isHighFrequencySilentPath('/sub/my-token-123')).toBe(true);
      expect(isHighFrequencySilentPath('/api/v1/sub/my-token-123?type=clash')).toBe(true);
      expect(isHighFrequencySilentPath('/api/v1/admin/lines/speedtest-all')).toBe(true);
      expect(isHighFrequencySilentPath('/api/v1/lines/speedtest/single')).toBe(true);
    });

    it('正确放行常规业务路径', () => {
      expect(isHighFrequencySilentPath('/api/v1/auth/login')).toBe(false);
      expect(isHighFrequencySilentPath('/api/v1/admin/nodes')).toBe(false);
      expect(isHighFrequencySilentPath('/api/v1/user/profile')).toBe(false);
    });
  });

  describe('intercept', () => {
    it('普通业务请求成功时正常入库 INFO 日志', (done) => {
      const context = createMockContext({ method: 'POST', originalUrl: '/api/v1/auth/login' });
      const next = { handle: () => of({ success: true }) };

      interceptor.intercept(context, next).subscribe({
        complete: () => {
          expect(mockSystemLogsService.enqueue).toHaveBeenCalledTimes(1);
          expect(mockSystemLogsService.enqueue).toHaveBeenCalledWith(
            expect.objectContaining({
              level: 'INFO',
              module: 'HTTP',
              message: expect.stringContaining('POST /api/v1/auth/login -> 200')
            })
          );
          done();
        }
      });
    });

    it('静态忽略路径完全不入库', (done) => {
      const context = createMockContext({ originalUrl: '/api/v1/logs/stream' });
      const next = { handle: () => of(null) };

      interceptor.intercept(context, next).subscribe({
        complete: () => {
          expect(mockSystemLogsService.enqueue).not.toHaveBeenCalled();
          done();
        }
      });
    });

    it('高频接口成功时（< 400）静默跳过，不入库日志', (done) => {
      const context = createMockContext({
        method: 'POST',
        originalUrl: '/api/v1/agent/poll'
      });
      const next = { handle: () => of({ ok: true }) };

      interceptor.intercept(context, next).subscribe({
        complete: () => {
          expect(mockSystemLogsService.enqueue).not.toHaveBeenCalled();
          done();
        }
      });
    });

    it('高频接口失败时（>= 400）100% 记录日志以备排查', (done) => {
      const context = createMockContext(
        { method: 'GET', originalUrl: '/sub/invalid-token' },
        { statusCode: 404 }
      );
      const next = { handle: () => throwError(() => new HttpException('Not Found', 404)) };

      interceptor.intercept(context, next).subscribe({
        error: (err) => {
          expect(err).toBeDefined();
          expect(mockSystemLogsService.enqueue).toHaveBeenCalledTimes(1);
          expect(mockSystemLogsService.enqueue).toHaveBeenCalledWith(
            expect.objectContaining({
              level: 'WARN',
              module: 'HTTP',
              message: expect.stringContaining('/sub/invalid-token -> 404')
            })
          );
          done();
        }
      });
    });

    it('高频探活抛出 500 错误时以 ERROR 级别入库', (done) => {
      const context = createMockContext(
        { method: 'GET', originalUrl: '/health' },
        { statusCode: 500 }
      );
      const next = { handle: () => throwError(() => new Error('Service Unavailable')) };

      interceptor.intercept(context, next).subscribe({
        error: () => {
          expect(mockSystemLogsService.enqueue).toHaveBeenCalledTimes(1);
          expect(mockSystemLogsService.enqueue).toHaveBeenCalledWith(
            expect.objectContaining({
              level: 'ERROR',
              module: 'HTTP',
              message: expect.stringContaining('/health -> 500')
            })
          );
          done();
        }
      });
    });
  });
});
