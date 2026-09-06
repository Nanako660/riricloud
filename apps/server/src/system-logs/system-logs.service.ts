import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { LogMetricsDto, TrendBucket } from './dto/log-metrics.dto';
import type { QueryLogsDto } from './dto/query-logs.dto';
import { maskSensitiveString, sanitizeLogMetadata } from './masking.util';
import { SSEHubService } from './sse-hub.service';

export interface EnqueueLogInput {
  id?: string;
  traceId?: string | null;
  source: 'SERVER' | 'WEB' | 'AGENT' | 'SINGBOX';
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  module: string;
  message: string;
  metadata?: Record<string, unknown> | string;
  nodeId?: string | null;
  userId?: string | null;
  createdAt?: Date;
}

@Injectable()
export class SystemLogsService implements OnModuleInit, OnModuleDestroy {
  private static readonly MAX_BUFFER_ENTRIES = 5000;
  private static readonly MAX_BUFFER_BYTES = 8 * 1024 * 1024;
  private readonly logger = new Logger(SystemLogsService.name);
  private buffer: Prisma.SystemLogCreateManyInput[] = [];
  private bufferBytes = 0;
  private flushTimer: NodeJS.Timeout | null = null;
  private isFlushing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sseHub: SSEHubService
  ) {}

  onModuleInit(): void {
    // 启动 1000ms 定时刷新队列，批量落库 SQLite
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, 1000);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  /**
   * 写入单条或批量日志到内存环形缓冲队列
   */
  enqueue(input: EnqueueLogInput): void {
    const id = input.id || randomUUID();
    const createdAt = input.createdAt || new Date();
    const maskedMessage = maskSensitiveString(input.message).slice(0, 8192);

    let metadataStr = '{}';
    if (typeof input.metadata === 'string') {
      try {
        const parsed = JSON.parse(input.metadata);
        metadataStr = JSON.stringify(sanitizeLogMetadata(parsed));
      } catch {
        metadataStr = JSON.stringify({ raw: maskSensitiveString(input.metadata) });
      }
    } else if (input.metadata && typeof input.metadata === 'object') {
      metadataStr = JSON.stringify(sanitizeLogMetadata(input.metadata));
    }

    if (Buffer.byteLength(metadataStr, 'utf8') > 16 * 1024) metadataStr = JSON.stringify({ truncated: true });

    const entry: Prisma.SystemLogCreateManyInput = {
      id,
      traceId: input.traceId || null,
      source: input.source,
      level: input.level,
      module: input.module.slice(0, 128),
      message: maskedMessage,
      metadata: metadataStr,
      nodeId: input.nodeId || null,
      userId: input.userId || null,
      createdAt
    };

    const entryBytes = Buffer.byteLength(maskedMessage, 'utf8') + Buffer.byteLength(metadataStr, 'utf8') + 256;
    if (this.buffer.length >= SystemLogsService.MAX_BUFFER_ENTRIES || this.bufferBytes + entryBytes > SystemLogsService.MAX_BUFFER_BYTES) {
      this.logger.warn('system log buffer limit reached; dropping incoming log');
      return;
    }

    // 1. 立即广播给当前活跃的 SSE 实时监听客户端（0ms 极低延迟）
    this.sseHub.publish({
      ...entry,
      id,
      metadata: metadataStr,
      createdAt
    });

    // 2. 压入内存批量写入缓冲队列
    this.buffer.push(entry);
    this.bufferBytes += entryBytes;

    // 3. 防抖阈值：积攒超过 50 条立即触发批量写入
    if (this.buffer.length >= 50) {
      void this.flush();
    }
  }

  /**
   * 将内存缓冲队列中的日志批量异步写入 SQLite
   */
  async flush(): Promise<void> {
    if (this.isFlushing || this.buffer.length === 0) {
      return;
    }
    this.isFlushing = true;
    const toWrite = this.buffer;
    this.buffer = [];
    this.bufferBytes = 0;

    try {
      await this.prisma.systemLog.createMany({
        data: toWrite
      });
    } catch (err) {
      this.logger.error(`Flush system logs to SQLite failed: ${String(err)}`, (err as Error)?.stack);
      // 写入失败时，若队列过大则丢弃以防内存膨胀，否则放回头部稍后重试
      if (toWrite.length < 500) {
        this.buffer.unshift(...toWrite);
        this.bufferBytes += toWrite.reduce((sum, item) => sum + Buffer.byteLength(item.message, 'utf8') + Buffer.byteLength(item.metadata ?? '{}', 'utf8') + 256, 0);
      }
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * 多维分页组合检索
   */
  async query(dto: QueryLogsDto) {
    // 查询前先刷写内存，确保检索到最新入队的日志
    await this.flush();

    const page = dto.page && dto.page > 0 ? Number(dto.page) : 1;
    const pageSize = dto.pageSize && dto.pageSize > 0 ? Math.min(Number(dto.pageSize), 200) : 50;
    const skip = (page - 1) * pageSize;

    const where: Prisma.SystemLogWhereInput = {};

    if (dto.level) {
      where.level = dto.level;
    }
    if (dto.source) {
      where.source = dto.source;
    }
    if (dto.nodeId) {
      where.nodeId = dto.nodeId;
    }
    if (dto.userId) {
      where.userId = dto.userId;
    }
    if (dto.module) {
      where.module = { contains: dto.module };
    }
    if (dto.traceId) {
      where.traceId = dto.traceId;
    }
    if (dto.startTime || dto.endTime) {
      where.createdAt = {
        gte: dto.startTime ? new Date(dto.startTime) : undefined,
        lte: dto.endTime ? new Date(dto.endTime) : undefined
      };
    }
    if (dto.keyword) {
      const kw = dto.keyword.trim();
      where.OR = [
        { message: { contains: kw } },
        { module: { contains: kw } },
        { traceId: { contains: kw } },
        { metadata: { contains: kw } }
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.systemLog.count({ where }),
      this.prisma.systemLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          node: { select: { id: true, name: true, serverHost: true } },
          user: { select: { id: true, email: true, nickname: true } }
        }
      })
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    };
  }

  /**
   * 获取大盘 KPI 指标与 24 小时分级趋势
   */
  async getMetrics(hours = 24): Promise<LogMetricsDto> {
    await this.flush();

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const [totalLogs, errorCount24h, warnCount24h, recentLogs] = await Promise.all([
      this.prisma.systemLog.count(),
      this.prisma.systemLog.count({
        where: { level: 'ERROR', createdAt: { gte: since } }
      }),
      this.prisma.systemLog.count({
        where: { level: 'WARN', createdAt: { gte: since } }
      }),
      this.prisma.systemLog.findMany({
        where: { createdAt: { gte: since } },
        select: { level: true, metadata: true, createdAt: true },
        orderBy: { createdAt: 'asc' }
      })
    ]);

    // 计算分小时时间桶
    const bucketMap = new Map<string, TrendBucket>();
    const now = new Date();
    for (let i = hours - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 60 * 60 * 1000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:00`;
      bucketMap.set(key, {
        bucket: key,
        total: 0,
        info: 0,
        warn: 0,
        error: 0,
        debug: 0
      });
    }

    let latencySum = 0;
    let latencyCount = 0;

    for (const log of recentLogs) {
      const d = new Date(log.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:00`;
      let b = bucketMap.get(key);
      if (!b) {
        b = { bucket: key, total: 0, info: 0, warn: 0, error: 0, debug: 0 };
        bucketMap.set(key, b);
      }
      b.total += 1;
      if (log.level === 'ERROR') b.error += 1;
      else if (log.level === 'WARN') b.warn += 1;
      else if (log.level === 'DEBUG') b.debug += 1;
      else b.info += 1;

      // 提取延迟
      if (log.metadata) {
        try {
          const parsed = JSON.parse(log.metadata);
          if (typeof parsed.durationMs === 'number' && parsed.durationMs >= 0) {
            latencySum += parsed.durationMs;
            latencyCount += 1;
          }
        } catch {
          // ignore
        }
      }
    }

    const avgLatencyMs = latencyCount > 0 ? Math.round(latencySum / latencyCount) : 0;

    return {
      totalLogs,
      errorCount24h,
      warnCount24h,
      avgLatencyMs,
      trend: Array.from(bucketMap.values())
    };
  }

  /**
   * 清理过期与超出上限的日志记录
   */
  async clean(retentionDays?: number, maxRecords?: number): Promise<{ deletedCount: number }> {
    await this.flush();
    let deletedCount = 0;

    // 1. 按保留天数清理
    if (retentionDays && retentionDays > 0) {
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      const res = await this.prisma.systemLog.deleteMany({
        where: { createdAt: { lt: cutoff } }
      });
      deletedCount += res.count;
    }

    // 2. 按最大条数上限清理
    if (maxRecords && maxRecords > 0) {
      const currentTotal = await this.prisma.systemLog.count();
      if (currentTotal > maxRecords) {
        const excess = currentTotal - maxRecords;
        // 查找第 excess 条日志的时间戳
        const pivotLogs = await this.prisma.systemLog.findMany({
          select: { id: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
          skip: excess - 1
        });
        if (pivotLogs.length > 0) {
          const pivotDate = pivotLogs[0].createdAt;
          const res = await this.prisma.systemLog.deleteMany({
            where: { createdAt: { lte: pivotDate } }
          });
          deletedCount += res.count;
        }
      }
    }

    return { deletedCount };
  }

  /**
   * 导出日志数据
   */
  async export(dto: QueryLogsDto, format: 'json' | 'csv' = 'json'): Promise<string> {
    await this.flush();

    const where: Prisma.SystemLogWhereInput = {};
    if (dto.level) where.level = dto.level;
    if (dto.source) where.source = dto.source;
    if (dto.nodeId) where.nodeId = dto.nodeId;
    if (dto.userId) where.userId = dto.userId;
    if (dto.module) where.module = { contains: dto.module };
    if (dto.traceId) where.traceId = dto.traceId;
    if (dto.startTime || dto.endTime) {
      where.createdAt = {
        gte: dto.startTime ? new Date(dto.startTime) : undefined,
        lte: dto.endTime ? new Date(dto.endTime) : undefined
      };
    }
    if (dto.keyword) {
      const kw = dto.keyword.trim();
      where.OR = [
        { message: { contains: kw } },
        { module: { contains: kw } },
        { traceId: { contains: kw } },
        { metadata: { contains: kw } }
      ];
    }

    const items = await this.prisma.systemLog.findMany({
      where,
      take: 5000,
      orderBy: { createdAt: 'desc' }
    });

    if (format === 'csv') {
      const headers = ['id', 'createdAt', 'source', 'level', 'module', 'traceId', 'nodeId', 'message', 'metadata'];
      const rows = items.map((item) => [
        item.id,
        item.createdAt.toISOString(),
        item.source,
        item.level,
        `"${item.module.replace(/"/g, '""')}"`,
        item.traceId || '',
        item.nodeId || '',
        `"${item.message.replace(/"/g, '""')}"`,
        `"${item.metadata.replace(/"/g, '""')}"`
      ]);
      return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    }

    return JSON.stringify(items, null, 2);
  }
}
