import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelemetryPrismaService } from '../prisma/telemetry-prisma.service';
import { SettingsService } from '../system/settings.service';
import { SystemLogsService } from './system-logs.service';
import {
  CLEANUP_MODES,
  CLEANUP_TARGETS,
  type CleanupMode,
  type CleanupTargetKind,
  type TelemetryCleanupDto,
  type TelemetryCleanupTargetDto
} from './dto/telemetry-cleanup.dto';

export const CLEANUP_CONFIRMATION_PHRASE = 'CLEAR_HISTORY';
export const LEGACY_TRAFFIC_RETENTION_DAYS = 7;

type Delegate = {
  count(args?: Record<string, unknown>): Promise<number>;
  findFirst(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  findMany(args: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  deleteMany(args: Record<string, unknown>): Promise<{ count: number }>;
};

type CleanupPlan = {
  kind: CleanupTargetKind;
  mode: CleanupMode;
  where: Record<string, unknown>;
  condition: string;
  field: 'bucketStart' | 'createdAt' | 'recordedAt';
  keepLatest?: number;
  maxRecords?: number;
};

type PreviewItem = {
  kind: CleanupTargetKind;
  mode: CleanupMode;
  matchedCount: number;
  estimatedBytes: number;
  oldest: string | null;
  newest: string | null;
  condition: string;
  policy: { retentionDays?: number; maxRecords?: number };
};

const TARGET_META: Record<CleanupTargetKind, {
  field: CleanupPlan['field'];
  estimateBytes: number;
}> = {
  trafficHourly: { field: 'bucketStart', estimateBytes: 96 },
  nodeRate: { field: 'bucketStart', estimateBytes: 80 },
  systemLog: { field: 'createdAt', estimateBytes: 2048 },
  legacyTraffic: { field: 'recordedAt', estimateBytes: 80 }
};

@Injectable()
export class TelemetryCleanupService {
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly telemetryPrisma: TelemetryPrismaService,
    private readonly settingsService: SettingsService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  async preview(dto: TelemetryCleanupDto): Promise<{ items: PreviewItem[]; generatedAt: string }> {
    await this.systemLogsService.flush();
    const plans = await this.buildPlans(dto.targets);
    const items = await Promise.all(plans.map((plan) => this.previewPlan(plan)));
    return { items, generatedAt: new Date().toISOString() };
  }

  async execute(dto: TelemetryCleanupDto, operator: { id: string; role?: string; traceId?: string }) {
    if (dto.confirmationPhrase !== CLEANUP_CONFIRMATION_PHRASE) {
      throw new BadRequestException(`请输入确认短语 ${CLEANUP_CONFIRMATION_PHRASE}`);
    }
    if (this.running) throw new BadRequestException('已有清理任务正在执行');
    this.running = true;
    const startedAt = Date.now();
    const startedAtIso = new Date(startedAt).toISOString();
    const results: Array<Record<string, unknown>> = [];

    try {
      const plans = await this.buildPlans(dto.targets);
      await this.systemLogsService.flush();
      for (const plan of plans) {
        const targetStartedAt = Date.now();
        let matchedCount = 0;
        try {
          const preview = await this.previewPlan(plan);
          matchedCount = preview.matchedCount;
          const deleted = await this.deletePlan(plan);
          results.push({
            kind: plan.kind,
            mode: plan.mode,
            matchedCount: preview.matchedCount,
            success: true,
            deletedCount: deleted,
            durationMs: Date.now() - targetStartedAt,
            condition: plan.condition
          });
        } catch (error) {
          results.push({
            kind: plan.kind,
            mode: plan.mode,
            matchedCount,
            success: false,
            deletedCount: 0,
            durationMs: Date.now() - targetStartedAt,
            condition: plan.condition,
            error: String(error)
          });
        }
      }

      const failed = results.some((item) => item.success !== true);
      const status = failed ? (results.some((item) => item.success === true) ? 'PARTIAL' : 'FAILED') : 'SUCCEEDED';
      const completedAtIso = new Date().toISOString();
      const audit = {
        operatorId: operator.id,
        role: operator.role ?? 'ADMIN',
        traceId: operator.traceId ?? null,
        status,
        startedAt: startedAtIso,
        completedAt: completedAtIso,
        targets: results,
        durationMs: Date.now() - startedAt
      };
      this.systemLogsService.enqueue({
        traceId: operator.traceId ?? null,
        source: 'SERVER',
        level: status === 'SUCCEEDED' ? 'INFO' : 'WARN',
        module: 'TelemetryCleanup',
        message: `历史观测数据清理${status === 'SUCCEEDED' ? '完成' : status === 'PARTIAL' ? '部分完成' : '失败'}`,
        metadata: audit,
        userId: operator.id,
        bypassMinIngestLevel: true
      });
      await this.systemLogsService.flush();
      return { status, results, audit: { ...audit, durationMs: Date.now() - startedAt } };
    } finally {
      this.running = false;
    }
  }

  private async buildPlans(targets: TelemetryCleanupTargetDto[]): Promise<CleanupPlan[]> {
    const seen = new Set<CleanupTargetKind>();
    const settings = await this.settingsService.getSettings();
    const plans: CleanupPlan[] = [];
    for (const target of targets) {
      if (seen.has(target.kind)) throw new BadRequestException(`清理目标重复：${target.kind}`);
      seen.add(target.kind);
      if (!CLEANUP_TARGETS.includes(target.kind) || !CLEANUP_MODES.includes(target.mode)) {
        throw new BadRequestException('清理目标或模式无效');
      }
      const meta = TARGET_META[target.kind];
      let where: Record<string, unknown> = {};
      let condition = '清空全部历史记录';
      const days = target.kind === 'trafficHourly'
        ? settings.trafficHourlyRetentionDays
        : target.kind === 'nodeRate'
          ? settings.nodeRateRetentionDays
          : target.kind === 'systemLog'
            ? settings.logsRetentionDays
            : LEGACY_TRAFFIC_RETENTION_DAYS;
      const maxRecords = target.kind === 'systemLog' && target.mode === 'retention' ? settings.logsMaxCount : undefined;
      const policy = target.mode === 'retention'
        ? `按当前策略保留 ${days} 天${maxRecords ? `，最多保留 ${maxRecords} 条` : ''}`
        : target.mode === 'all' ? '清空全部历史记录' : '';

      if (target.mode === 'retention') {
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        where = { [meta.field]: { lt: cutoff } };
        condition = policy;
      } else if (target.mode === 'before') {
        if (!target.before) throw new BadRequestException(`${target.kind} 缺少 before`);
        const before = new Date(target.before);
        if (!Number.isFinite(before.getTime())) throw new BadRequestException('before 时间无效');
        where = { [meta.field]: { lt: before } };
        condition = `删除 ${before.toISOString()} 之前的记录`;
      } else if (target.mode === 'range') {
        if (!target.from || !target.to) throw new BadRequestException(`${target.kind} 需要 from 和 to`);
        const from = new Date(target.from);
        const to = new Date(target.to);
        if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) {
          throw new BadRequestException('时间区间无效，必须满足 from < to');
        }
        where = { [meta.field]: { gte: from, lt: to } };
        condition = `删除 ${from.toISOString()} 至 ${to.toISOString()} 的记录`;
      } else if (target.mode === 'count') {
        if (!target.keepLatest) throw new BadRequestException(`${target.kind} 缺少 keepLatest`);
        where = await this.buildCountWhere(target.kind, meta.field, target.keepLatest);
        condition = `仅保留最新 ${target.keepLatest} 条记录`;
      }

      plans.push({ kind: target.kind, mode: target.mode, where, condition, field: meta.field, keepLatest: target.keepLatest, maxRecords });
    }
    return plans;
  }

  private async buildCountWhere(kind: CleanupTargetKind, field: CleanupPlan['field'], keepLatest: number): Promise<Record<string, unknown>> {
    const delegate = this.delegate(kind);
    const total = await delegate.count();
    if (total <= keepLatest) return { id: { in: [] } };
    const stale = await delegate.findMany({
      select: { id: true },
      orderBy: [{ [field]: 'asc' }, { id: 'asc' }],
      take: total - keepLatest
    });
    return { id: { in: stale.map((item) => item.id).filter((id): id is string => typeof id === 'string') } };
  }

  private async previewPlan(plan: CleanupPlan): Promise<PreviewItem> {
    const delegate = this.delegate(plan.kind);
    const baseMatchedCount = await delegate.count({ where: plan.where });
    let matchedCount = baseMatchedCount;
    let oldest = matchedCount > 0 ? await delegate.findFirst({ where: plan.where, orderBy: { [plan.field]: 'asc' }, select: { [plan.field]: true } }) : null;
    let newest = matchedCount > 0 ? await delegate.findFirst({ where: plan.where, orderBy: { [plan.field]: 'desc' }, select: { [plan.field]: true } }) : null;

    if (plan.maxRecords) {
      const total = await delegate.count();
      const extraCount = Math.max(0, total - baseMatchedCount - plan.maxRecords);
      matchedCount += extraCount;
      if (extraCount > 0) {
        const cutoff = (plan.where[plan.field] as { lt?: Date } | undefined)?.lt;
        if (cutoff) {
          const remainingWhere = { [plan.field]: { gte: cutoff } };
          const extraOldest = await delegate.findFirst({ where: remainingWhere, orderBy: { [plan.field]: 'asc' }, select: { [plan.field]: true } });
          const extraNewest = await delegate.findFirst({
            where: remainingWhere,
            orderBy: [{ [plan.field]: 'asc' }, { id: 'asc' }],
            skip: extraCount - 1,
            select: { [plan.field]: true }
          });
          if (!oldest) oldest = extraOldest;
          newest = extraNewest;
        }
      }
    }
    const estimatedBytes = matchedCount * TARGET_META[plan.kind].estimateBytes;
    return {
      kind: plan.kind,
      mode: plan.mode,
      matchedCount,
      estimatedBytes,
      oldest: this.toIso(oldest?.[plan.field]),
      newest: this.toIso(newest?.[plan.field]),
      condition: plan.condition,
      policy: await this.policyFor(plan.kind)
    };
  }

  private async deletePlan(plan: CleanupPlan): Promise<number> {
    const delegate = this.delegate(plan.kind);
    const result = await delegate.deleteMany({ where: plan.where });
    if (!plan.maxRecords) return result.count;

    const remaining = await delegate.count();
    const excess = remaining - plan.maxRecords;
    if (excess <= 0) return result.count;
    const oldest = await delegate.findMany({
      select: { id: true },
      orderBy: [{ [plan.field]: 'asc' }, { id: 'asc' }],
      take: excess
    });
    const ids = oldest.map((item) => item.id).filter((id): id is string => typeof id === 'string');
    if (ids.length === 0) return result.count;
    const countResult = await delegate.deleteMany({ where: { id: { in: ids } } });
    return result.count + countResult.count;
  }

  private delegate(kind: CleanupTargetKind): Delegate {
    if (kind === 'legacyTraffic') {
      return this.prisma.trafficLog as unknown as Delegate;
    }
    const telemetry = this.telemetryPrisma as unknown as {
      trafficHourlyMetric: Delegate;
      nodeRateMetric: Delegate;
      systemLog: Delegate;
    };
    if (kind === 'trafficHourly') return telemetry.trafficHourlyMetric;
    if (kind === 'nodeRate') return telemetry.nodeRateMetric;
    return telemetry.systemLog;
  }

  private async policyFor(kind: CleanupTargetKind): Promise<{ retentionDays?: number; maxRecords?: number }> {
    if (kind === 'legacyTraffic') return { retentionDays: LEGACY_TRAFFIC_RETENTION_DAYS };
    const settings = await this.settingsService.getSettings();
    if (kind === 'trafficHourly') return { retentionDays: settings.trafficHourlyRetentionDays };
    if (kind === 'nodeRate') return { retentionDays: settings.nodeRateRetentionDays };
    return { retentionDays: settings.logsRetentionDays, maxRecords: settings.logsMaxCount };
  }

  private toIso(value: unknown): string | null {
    return value instanceof Date ? value.toISOString() : null;
  }
}
