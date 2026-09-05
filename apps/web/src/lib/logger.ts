// Web 前端统一日志与异常上报 SDK（守卫安全红线，敏感数据强脱敏）

export type FrontendLogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface FrontendLogPayload {
  level: FrontendLogLevel;
  message: string;
  module?: string;
  traceId?: string;
  metadata?: Record<string, unknown>;
}

const SENSITIVE_KEY_PATTERN = /(password|token|secret|authorization|credential|cookie|jwt|hash|uuid)/i;

function maskValue(val: unknown): unknown {
  if (typeof val === 'string') {
    let s = val.replace(/(Bearer\s+)([A-Za-z0-9_.-]{8})[A-Za-z0-9_.-]*/gi, '$1$2***');
    s = s.replace(/([?&](?:token|password|secret|key)=)([^&\s]+)/gi, '$1***');
    return s;
  }
  if (Array.isArray(val)) {
    return val.map(maskValue);
  }
  if (val && typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (SENSITIVE_KEY_PATTERN.test(k)) {
        res[k] = '***';
      } else {
        res[k] = maskValue(v);
      }
    }
    return res;
  }
  return val;
}

class FrontendLogger {
  private buffer: FrontendLogPayload[] = [];
  private timer: number | null = null;
  private isInitialized = false;

  init(): void {
    if (this.isInitialized || typeof window === 'undefined') {
      return;
    }
    this.isInitialized = true;

    // 1. 全局捕获未处理 JS 错误
    window.addEventListener('error', (event) => {
      this.error(
        event.message || 'Window Script Error',
        'GlobalError',
        {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack,
          url: window.location.href
        }
      );
    });

    // 2. 全局捕获未处理 Promise 拒绝
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      const msg = reason instanceof Error ? reason.message : String(reason || 'Unhandled Promise Rejection');
      const stack = reason instanceof Error ? reason.stack : undefined;
      this.error(
        msg,
        'UnhandledRejection',
        {
          stack,
          url: window.location.href
        }
      );
    });

    // 3. 页面卸载前尝试通过 sendBeacon 冲刷剩余日志
    window.addEventListener('beforeunload', () => {
      this.flushBeacon();
    });
  }

  log(level: FrontendLogLevel, message: string, module = 'App', metadata?: Record<string, unknown>, traceId?: string): void {
    const sanitizedMetadata = metadata ? (maskValue(metadata) as Record<string, unknown>) : {};
    sanitizedMetadata.url = window.location.href;

    this.buffer.push({
      level,
      message: String(maskValue(message)),
      module,
      traceId,
      metadata: sanitizedMetadata
    });

    if (this.buffer.length >= 10) {
      void this.flush();
    } else if (!this.timer) {
      this.timer = window.setTimeout(() => {
        void this.flush();
      }, 2000);
    }
  }

  info(message: string, module?: string, metadata?: Record<string, unknown>, traceId?: string): void {
    this.log('INFO', message, module, metadata, traceId);
  }

  warn(message: string, module?: string, metadata?: Record<string, unknown>, traceId?: string): void {
    this.log('WARN', message, module, metadata, traceId);
  }

  error(message: string, module?: string, metadata?: Record<string, unknown>, traceId?: string): void {
    this.log('ERROR', message, module, metadata, traceId);
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.buffer.length === 0) {
      return;
    }

    const toSend = this.buffer;
    this.buffer = [];

    try {
      await fetch('/api/v1/logs/frontend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs: toSend })
      });
    } catch {
      // 网络离线时丢弃或避免循环死锁
    }
  }

  private flushBeacon(): void {
    if (this.buffer.length === 0 || !navigator.sendBeacon) {
      return;
    }
    const payload = JSON.stringify({ logs: this.buffer });
    this.buffer = [];
    const blob = new Blob([payload], { type: 'application/json' });
    navigator.sendBeacon('/api/v1/logs/frontend', blob);
  }
}

export const frontendLogger = new FrontendLogger();
frontendLogger.init();
