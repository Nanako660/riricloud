import { Injectable, Logger, NotFoundException, OnModuleDestroy, Optional, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { deepMerge, isUserEntitled } from '../common/utils';
import {
  buildClientTls,
  buildClientTransport,
  buildShadowsocksClientPassword,
  buildServerInbounds,
  normalizeShadowsocksPassword,
  parseTrafficCredential,
  revealInboundSecrets,
  type InboundUserCredential
} from '../common/inbound';
import { resolveLineTags } from '../common/line-tags';
import { DEFAULT_INBOUND_LISTEN, getStatsApiListen } from '../common/ports';
import {
  INTERNAL_RELAY_TRANSIT_EMAIL,
  INTERNAL_RELAY_TRANSIT_SECRET,
  INTERNAL_RELAY_TRANSIT_UUID,
  type ProtocolType
} from '../common/constants';
import { AGENT_PROTOCOL_VERSION, type AuthResultData, type AgentPollResponse, type AgentTaskMessage, type AgentTransportMode, type ConfigApplyResultData, type ConfigSyncData, type HeartbeatData, type ProbeRequest, type ProbeResultData, type RestartAgentResultData, type UpgradeResultData, type UpgradeTarget, type UpgradeTaskData, type LogReportData } from './agent-message';
import type { AgentPollDto } from './dto/agent-poll.dto';
import { SettingsService } from '../system/settings.service';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { isLineAuthorized } from '../common/line-access';
import { getTrafficPeriod } from '../common/traffic-reset';
import { hashAgentToken } from '../common/agent-token';
import { decryptSecret } from '../common/secret-crypto';

// 活跃连接注册表：nodeId → WebSocket
export type AgentSocket = { send: (data: string) => void; close: (code?: number, reason?: string) => void };

type SubscriptionUserSnapshot = {
  uuid: string;
  email: string;
  role?: string;
  emailVerifiedAt?: Date | null;
  password: string | null;
  isActive: boolean;
  extraLineGrants?: Array<{ lineId: string }>;
};

type SubscriptionSnapshot = {
  id: string;
  status: string;
  trafficLimitBytes: bigint;
  trafficUsedBytes: bigint;
  expireAt: Date | null;
  user: SubscriptionUserSnapshot;
  plan?: {
    lineMatchMode: string;
    lineTagsJson: string;
    lineIdsJson: string;
  } | null;
};

type SubscriptionDelegate = {
  findMany: (args: Record<string, unknown>) => Promise<SubscriptionSnapshot[]>;
};

type TrafficSubscriptionDelegate = {
  findMany: (args: Record<string, unknown>) => Promise<Array<{
    id: string;
    userId: string;
    trafficPeriodStartAt?: Date | null;
    startedAt?: Date;
    plan?: { durationDays: number; trafficResetMode: string } | null;
  }>>;
  update: (args: Record<string, unknown>) => Promise<unknown>;
};

type TrafficCursorDelegate = {
  findMany: (args: Record<string, unknown>) => Promise<Array<{
    credential: string;
    uploadTotal: bigint;
    downloadTotal: bigint;
  }>>;
  upsert: (args: Record<string, unknown>) => Promise<unknown>;
};

type ResolvedTrafficLine = {
  id: string;
  trafficRate: number;
};

type PendingTask = AgentTaskMessage & { deliveredAt: number };

type TaskResult = {
  taskId: string;
  type: 'upgrade' | 'probe' | 'restart';
  success: boolean;
  message: string;
  completedAt: string;
};

export type UpgradeTaskOptions = {
  resourceId?: string;
  assetId?: string;
  releaseId?: string;
  previousAssetId?: string | null;
  operation?: 'UPGRADE' | 'ROLLBACK';
  files?: UpgradeTaskData['files'];
  requestedById?: string;
};

type DeploymentTaskRecord = {
  id: string;
  nodeId: string;
  assetId: string;
  previousAssetId: string | null;
  releaseId: string;
  kind: string;
  operation: string;
  status: string;
  attempts: number;
  payloadJson: string;
  errorMessage: string | null;
  requestedById: string | null;
  requestedAt: Date;
  dispatchedAt: Date | null;
  completedAt: Date | null;
};

type DeploymentTaskDelegate = {
  create: (args: Record<string, unknown>) => Promise<DeploymentTaskRecord>;
  findUnique: (args: Record<string, unknown>) => Promise<DeploymentTaskRecord | null>;
  findFirst: (args: Record<string, unknown>) => Promise<DeploymentTaskRecord | null>;
  findMany: (args: Record<string, unknown>) => Promise<DeploymentTaskRecord[]>;
  update: (args: Record<string, unknown>) => Promise<DeploymentTaskRecord>;
};

const NODE_RATE_BUCKET_MS = 5 * 60 * 1000;
const NODE_RATE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type NodeRateMetricDelegate = {
  findUnique: (args: Record<string, unknown>) => Promise<{
    id: string;
    sampleCount: number;
    uploadRateSum: number;
    downloadRateSum: number;
    uploadRatePeak: number;
    downloadRatePeak: number;
  } | null>;
  create: (args: Record<string, unknown>) => Promise<unknown>;
  update: (args: Record<string, unknown>) => Promise<unknown>;
};

type NodeRateMetricRootDelegate = {
  deleteMany: (args: Record<string, unknown>) => Promise<{ count: number }>;
};

const RATE_METRIC_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const RATE_METRIC_CLEANUP_RETRY_MS = 5 * 60 * 1000;
const RATE_METRIC_FLUSH_INTERVAL_MS = 5_000;
const AGENT_WRITE_RETRY_DELAY_MS = 250;
const AGENT_WRITE_MAX_ATTEMPTS = 3;

type PendingHeartbeat = {
  data: HeartbeatData;
  mode: AgentTransportMode;
  waiters: Array<{ resolve: () => void; reject: (error: unknown) => void }>;
  retryCount: number;
};

type RateMetricAggregate = {
  nodeId: string;
  bucketStart: Date;
  sampleCount: number;
  uploadRateSum: number;
  downloadRateSum: number;
  uploadRatePeak: number;
  downloadRatePeak: number;
};

@Injectable()
export class AgentService implements OnModuleDestroy {
  private readonly logger = new Logger(AgentService.name);
  private readonly sockets = new Map<string, AgentSocket>();
  private readonly pendingTasks = new Map<string, PendingTask[]>();
  private readonly taskResults = new Map<string, TaskResult>();
  private readonly configCache = new Map<string, ConfigSyncData>();
  private readonly pendingHeartbeats = new Map<string, PendingHeartbeat>();
  private readonly heartbeatRetryTimers = new Map<string, NodeJS.Timeout>();
  private writeTail: Promise<void> = Promise.resolve();
  private writeQueueDepth = 0;
  private readonly rateMetricBuckets = new Map<string, RateMetricAggregate>();
  private configVersion = Date.now();
  private configPushTimer?: NodeJS.Timeout;
  private rateMetricFlushTimer?: NodeJS.Timeout;
  private configPushWaiters: Array<(count: number) => void> = [];
  private nextRateMetricCleanupAt = 0;
  private trafficCounterResetCount = 0;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly settingsService?: SettingsService,
    @Optional() private readonly systemLogsService?: SystemLogsService
  ) {
    if (this.settingsService) {
      this.settingsService.onSettingsChange((patch) => {
        if (patch.enforceEmailVerification !== undefined) {
          void this.pushConfigToAll();
        }
      });
    }
  }

  // 握手鉴权：校验 agentToken，返回鉴权结果与节点
  async authenticate(token: string | undefined): Promise<
    { ok: true; nodeId: string; nodeName: string } | { ok: false; message: string }
  > {
    if (!token) {
      return { ok: false, message: '缺少 token' };
    }
      const node = await this.prisma.node.findFirst({ where: { OR: [{ agentTokenHash: hashAgentToken(token) }, { agentToken: token }] } });
    if (!node) {
      return { ok: false, message: '无效的 AgentToken' };
    }
    if (node.status === 'DISABLED') {
      return { ok: false, message: '节点已被禁用' };
    }
    return { ok: true, nodeId: node.id, nodeName: node.name };
  }

  // 注册连接并标记上线
  async register(nodeId: string, socket: AgentSocket): Promise<AuthResultData> {
    const existing = this.sockets.get(nodeId);
    if (existing) {
      // 同节点旧连接顶替：新连接优先
      existing.close(4000, 'superseded by new connection');
    }
    this.sockets.set(nodeId, socket);
    await this.enqueueAgentWrite('register', () => this.prisma.node.update({
      where: { id: nodeId },
      data: { status: 'ONLINE', communicationMode: 'WS', lastSeenAt: new Date() }
    }));
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    await this.dispatchQueuedUpgradeTasks(nodeId);
    this.logger.log(`agent online: node=${node?.name ?? nodeId}`);
    return { success: true, message: '鉴权成功', nodeId, protocolVersion: AGENT_PROTOCOL_VERSION };
  }

  // 心跳处理：遥测更新 + 流量同事务入库扣减（S6 红线）；内核状态可选字段落列
  async handleHeartbeat(nodeId: string, data: HeartbeatData, mode: AgentTransportMode = 'WS'): Promise<void> {
    const splitRates = this.getSplitRates(data);
    if (splitRates) {
      // 心跳合并只影响落库状态，速率采样本身必须保留，避免聚合桶少算样本。
      this.accumulateRateMetric(nodeId, new Date(), splitRates.uploadRate, splitRates.downloadRate);
    }
    return new Promise<void>((resolve, reject) => {
      const pending = this.pendingHeartbeats.get(nodeId);
      if (pending) {
        pending.data = data;
        pending.mode = mode;
        pending.waiters.push({ resolve, reject });
        return;
      }
      this.pendingHeartbeats.set(nodeId, { data, mode, waiters: [{ resolve, reject }], retryCount: 0 });
      void this.drainHeartbeats(nodeId);
    });
  }

  private async drainHeartbeats(nodeId: string): Promise<void> {
    while (true) {
      const pending = this.pendingHeartbeats.get(nodeId);
      if (!pending) return;
      this.pendingHeartbeats.delete(nodeId);
      try {
        await this.enqueueAgentWrite('heartbeat', () => this.persistHeartbeat(nodeId, pending.data, pending.mode));
        pending.waiters.forEach(({ resolve }) => resolve());
      } catch (error) {
        pending.waiters.forEach(({ reject }) => reject(error));
        const latest = this.pendingHeartbeats.get(nodeId);
        if (latest) {
          latest.retryCount = pending.retryCount + 1;
        } else {
          this.pendingHeartbeats.set(nodeId, {
            data: pending.data,
            mode: pending.mode,
            waiters: [],
            retryCount: pending.retryCount + 1
          });
        }
        const retryCount = pending.retryCount + 1;
        const delayMs = Math.min(30_000, AGENT_WRITE_RETRY_DELAY_MS * (2 ** Math.min(retryCount, 7)));
        this.scheduleHeartbeatRetry(nodeId, delayMs);
        this.logger.warn(`heartbeat persistence failed: node=${nodeId} retryInMs=${delayMs} error=${error}`);
        return;
      }
    }
  }

  private async resolveActiveLineForNode(nodeId: string): Promise<ResolvedTrafficLine | null> {
    const lineDelegate = (this.prisma as unknown as {
      line?: {
        findFirst: (args: Record<string, unknown>) => Promise<{ id: string; trafficRate?: number | null } | null>;
      };
    }).line;
    if (!lineDelegate) return null;

    const findFirst = (where: Record<string, unknown>) => lineDelegate.findFirst({
      where,
      select: { id: true, trafficRate: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
    });
    const line = await findFirst({ entryNodeId: nodeId, status: 'ACTIVE' })
      ?? await findFirst({
        landingNodeId: nodeId,
        type: 'RELAY',
        relayMode: 'BLIND_FORWARD',
        status: 'ACTIVE'
      });
    return line ? { id: line.id, trafficRate: this.normalizeTrafficRate(line.trafficRate) } : null;
  }

  private async persistHeartbeat(nodeId: string, data: HeartbeatData, mode: AgentTransportMode): Promise<void> {
    const heartbeatAt = new Date();
    await this.prisma.node.update({
      where: { id: nodeId },
      data: {
        cpuUsage: data.cpuUsage,
        memoryUsage: data.memoryUsage,
        bandwidthRate: data.bandwidthRate,
        // 旧版 Agent 没有拆分字段，清空旧的拆分值，避免把历史值误当作当前速率。
        uploadRate: data.uploadRate ?? null,
        downloadRate: data.downloadRate ?? null,
        lastSeenAt: heartbeatAt,
        status: 'ONLINE',
        communicationMode: mode,
        // 旧版 Agent 不上报内核状态时保持原值（undefined 不写入）
        ...(data.kernelRunning !== undefined ? { kernelRunning: data.kernelRunning } : {}),
        ...(data.lastError !== undefined && data.lastError !== ''
          ? { configError: data.lastError }
          : {}),
        ...(data.lastError === '' ? { configError: null } : {}),
        ...(data.agentVersion !== undefined ? { agentVersion: data.agentVersion } : {}),
        ...(data.osArch !== undefined ? { osArch: data.osArch } : {}),
        ...(data.kernelVersion !== undefined ? { kernelVersion: data.kernelVersion } : {})
      }
    });
    const trafficSnapshots = data.trafficSnapshots ?? [];
    if (trafficSnapshots.length) {
      const resolvedLine = await this.resolveActiveLineForNode(nodeId);
      const reset = await this.persistTrafficSnapshots(nodeId, trafficSnapshots, resolvedLine, heartbeatAt);
      if (reset) void this.pushConfigToAll();
    }
  }

  private async persistTrafficSnapshots(
    nodeId: string,
    records: HeartbeatData['trafficSnapshots'],
    line?: ResolvedTrafficLine | null,
    observedAt = new Date()
  ): Promise<boolean> {
    let resetCount = 0;
    await this.prisma.$transaction(async (tx) => {
      const snapshotsByCredential = new Map<string, { uploadTotal: bigint; downloadTotal: bigint }>();
      for (const record of records) {
        const current = snapshotsByCredential.get(record.userUuid);
        const uploadTotal = BigInt(record.uploadTotal);
        const downloadTotal = BigInt(record.downloadTotal);
        if (!current) {
          snapshotsByCredential.set(record.userUuid, { uploadTotal, downloadTotal });
          continue;
        }
        current.uploadTotal = current.uploadTotal > uploadTotal ? current.uploadTotal : uploadTotal;
        current.downloadTotal = current.downloadTotal > downloadTotal ? current.downloadTotal : downloadTotal;
      }
      const credentials = [...snapshotsByCredential.keys()];
      const parsedByCredential = new Map<string, { rawCredential: string; lineId: string | null }>();
      const rawCredentials = new Set<string>();
      const referencedLineIds = new Set<string>();

      for (const cred of credentials) {
        const parsed = parseTrafficCredential(cred);
        parsedByCredential.set(cred, parsed);
        rawCredentials.add(parsed.rawCredential);
        if (parsed.lineId) referencedLineIds.add(parsed.lineId);
      }

      const users = await tx.user.findMany({
        where: { OR: [{ uuid: { in: [...rawCredentials] } }, { email: { in: [...rawCredentials] } }] },
        select: { id: true, uuid: true, email: true }
      });
      const usersByCredential = new Map<string, { id: string; uuid: string; email: string }>();
      users.forEach((user) => {
        usersByCredential.set(user.uuid, user);
        usersByCredential.set(user.email, user);
      });

      const lineDelegate = (tx as unknown as {
        line?: { findMany: (args: Record<string, unknown>) => Promise<Array<{ id: string; trafficRate?: number | null }>> };
      }).line;
      const loadedLines = lineDelegate && referencedLineIds.size > 0
        ? await lineDelegate.findMany({
            where: { id: { in: [...referencedLineIds] } },
            select: { id: true, trafficRate: true }
          })
        : [];
      const linesById = new Map(loadedLines.map((l) => [l.id, { id: l.id, trafficRate: this.normalizeTrafficRate(l.trafficRate) }]));

      const cursor = (tx as unknown as { trafficCursor?: TrafficCursorDelegate }).trafficCursor;
      if (!cursor) throw new Error('TrafficCursor delegate is unavailable');
      const cursors = await cursor.findMany({
        where: { nodeId, credential: { in: credentials } },
        select: { credential: true, uploadTotal: true, downloadTotal: true }
      });
      const cursorByCredential = new Map(cursors.map((item) => [item.credential, item]));

      const logs: Array<{
        nodeId: string;
        userId: string;
        lineId?: string;
        upload: bigint;
        download: bigint;
        recordedAt: Date;
      }> = [];
      const totalsByUser = new Map<string, bigint>();
      const cursorUpdates = new Map<string, { uploadTotal: bigint; downloadTotal: bigint }>();
      for (const [credential, current] of snapshotsByCredential) {
        cursorUpdates.set(credential, current);
        const parsed = parsedByCredential.get(credential) ?? { rawCredential: credential, lineId: null };
        if (this.isInternalRelayCredential(parsed.rawCredential)) continue;

        const previous = cursorByCredential.get(credential);
        const previousUpload = previous?.uploadTotal ?? 0n;
        const previousDownload = previous?.downloadTotal ?? 0n;
        const uploadReset = current.uploadTotal < previousUpload;
        const downloadReset = current.downloadTotal < previousDownload;
        if (uploadReset || downloadReset) {
          this.trafficCounterResetCount += 1;
          this.logger.warn(`traffic counter reset detected: node=${nodeId} count=${this.trafficCounterResetCount}`);
        }
        const upload = uploadReset ? current.uploadTotal : current.uploadTotal - previousUpload;
        const download = downloadReset ? current.downloadTotal : current.downloadTotal - previousDownload;
        const user = usersByCredential.get(parsed.rawCredential);
        if (!user) {
          this.logger.warn('heartbeat: unknown user credential');
          continue;
        }
        const total = upload + download;
        if (total === 0n) continue;

        const activeLine = parsed.lineId
          ? (linesById.get(parsed.lineId) ?? { id: parsed.lineId, trafficRate: 1 })
          : line;
        const targetLineId = activeLine?.id;
        const targetTrafficRate = activeLine?.trafficRate ?? 1;

        logs.push({
          nodeId,
          userId: user.id,
          ...(targetLineId ? { lineId: targetLineId } : {}),
          upload,
          download,
          recordedAt: observedAt
        });
        const billedBytes = this.calculateBilledBytes(total, targetTrafficRate);
        totalsByUser.set(user.id, (totalsByUser.get(user.id) ?? 0n) + billedBytes);
      }
      const subscription = (tx as unknown as { subscription?: TrafficSubscriptionDelegate }).subscription;
      const subscriptionByUser = new Map<string, string>();
      if (subscription && totalsByUser.size) {
        const subscriptions = await subscription.findMany({
          where: { userId: { in: [...totalsByUser.keys()] } },
          select: {
            id: true,
            userId: true,
            startedAt: true,
            trafficPeriodStartAt: true,
            plan: { select: { durationDays: true, trafficResetMode: true } }
          }
        });
        const timezone = (await this.settingsService?.getSettings())?.systemTimezone ?? 'Asia/Shanghai';
        for (const item of subscriptions) {
          subscriptionByUser.set(item.userId, item.id);
          if (!item.plan || !item.startedAt) continue;
          const period = getTrafficPeriod(item.plan.trafficResetMode, observedAt, item.startedAt, item.plan.durationDays, timezone);
          if (!period) continue;
          const previous = item.trafficPeriodStartAt ?? null;
          const shouldReset = Boolean(previous && previous.getTime() < period.startAt.getTime());
          if (!previous) {
            await tx.subscription.updateMany({
              where: { id: item.id, trafficPeriodStartAt: null },
              data: { trafficPeriodStartAt: period.startAt }
            });
          } else if (shouldReset) {
            const updated = await tx.subscription.updateMany({
              where: { id: item.id, trafficPeriodStartAt: previous },
              data: { trafficPeriodStartAt: period.startAt, trafficUsedBytes: BigInt(0) }
            });
            if (updated.count > 0) {
              await tx.user.update({ where: { id: item.userId }, data: { trafficUsedBytes: BigInt(0) } });
              resetCount += 1;
            }
          }
        }
      }
      if (logs.length) {
        await tx.trafficLog.createMany({ data: logs });
      }
      const subscriptionTotals = new Map<string, bigint>();
      for (const [userId, total] of totalsByUser) {
        const subscriptionId = subscriptionByUser.get(userId);
        if (subscription && subscriptionId) {
          subscriptionTotals.set(subscriptionId, (subscriptionTotals.get(subscriptionId) ?? 0n) + total);
        }
      }
      await this.batchIncrement(tx, 'User', totalsByUser);
      await this.batchIncrement(tx, 'Subscription', subscriptionTotals);
      await this.batchUpsertTrafficCursors(tx, nodeId, cursorUpdates);
    });
    return resetCount > 0;
  }

  private isInternalRelayCredential(credential: string): boolean {
    return credential === INTERNAL_RELAY_TRANSIT_UUID || credential === INTERNAL_RELAY_TRANSIT_EMAIL;
  }

  private normalizeTrafficRate(value: number | null | undefined): number {
    return value !== undefined && value !== null && Number.isFinite(value) && value >= 0 ? value : 1;
  }

  // 将数据库中的浮点倍率转成十进制定点数，避免大整数流量先转 Number 后丢失精度。
  private calculateBilledBytes(total: bigint, trafficRate: number): bigint {
    if (total <= 0n) return 0n;
    const rate = this.normalizeTrafficRate(trafficRate);
    if (rate === 1) return total;

    const [coefficient, exponentText] = rate.toString().toLowerCase().split('e');
    const [integerPart, fractionPart = ''] = coefficient.split('.');
    let numerator = BigInt(`${integerPart}${fractionPart}`);
    const exponent = exponentText ? Number(exponentText) : 0;
    const scale = fractionPart.length - exponent;
    let denominator = 1n;
    if (scale >= 0) {
      denominator = 10n ** BigInt(scale);
    } else {
      numerator *= 10n ** BigInt(-scale);
    }
    const product = total * numerator;
    return (product * 2n + denominator) / (denominator * 2n);
  }

  private enqueueAgentWrite<T>(label: string, task: () => Promise<T>): Promise<T> {
    const queuedAt = Date.now();
    this.writeQueueDepth += 1;
    const run = this.writeTail.catch(() => undefined).then(async () => {
      this.writeQueueDepth = Math.max(0, this.writeQueueDepth - 1);
      const waitMs = Date.now() - queuedAt;
      if (waitMs >= 250) {
        this.logger.warn(`agent write queue delayed: type=${label} waitMs=${waitMs} depth=${this.writeQueueDepth}`);
      }
      const startedAt = Date.now();
      try {
        let lastError: unknown;
        for (let attempt = 1; attempt <= AGENT_WRITE_MAX_ATTEMPTS; attempt += 1) {
          try {
            return await task();
          } catch (error) {
            lastError = error;
            if (attempt === AGENT_WRITE_MAX_ATTEMPTS) throw error;
            const delayMs = AGENT_WRITE_RETRY_DELAY_MS * (2 ** (attempt - 1));
            this.logger.warn(`agent write retry: type=${label} attempt=${attempt + 1} delayMs=${delayMs}`);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        }
        throw lastError;
      } finally {
        const durationMs = Date.now() - startedAt;
        if (durationMs >= 1000) {
          this.logger.warn(`agent write slow: type=${label} durationMs=${durationMs}`);
        }
      }
    });
    this.writeTail = run.then(() => undefined, () => undefined);
    return run;
  }

  private scheduleHeartbeatRetry(nodeId: string, delayMs: number): void {
    if (this.heartbeatRetryTimers.has(nodeId)) return;
    const timer = setTimeout(() => {
      this.heartbeatRetryTimers.delete(nodeId);
      void this.drainHeartbeats(nodeId);
    }, delayMs);
    timer.unref?.();
    this.heartbeatRetryTimers.set(nodeId, timer);
  }

  private accumulateRateMetric(nodeId: string, heartbeatAt: Date, uploadRate: number, downloadRate: number): void {
    const bucketStart = new Date(Math.floor(heartbeatAt.getTime() / NODE_RATE_BUCKET_MS) * NODE_RATE_BUCKET_MS);
    const key = `${nodeId}:${bucketStart.getTime()}`;
    const existing = this.rateMetricBuckets.get(key);
    if (existing) {
      existing.sampleCount += 1;
      existing.uploadRateSum += uploadRate;
      existing.downloadRateSum += downloadRate;
      existing.uploadRatePeak = Math.max(existing.uploadRatePeak, uploadRate);
      existing.downloadRatePeak = Math.max(existing.downloadRatePeak, downloadRate);
    } else {
      this.rateMetricBuckets.set(key, {
        nodeId,
        bucketStart,
        sampleCount: 1,
        uploadRateSum: uploadRate,
        downloadRateSum: downloadRate,
        uploadRatePeak: uploadRate,
        downloadRatePeak: downloadRate
      });
    }
    if (!this.rateMetricFlushTimer) {
      this.rateMetricFlushTimer = setTimeout(() => {
        this.rateMetricFlushTimer = undefined;
        void this.flushRateMetrics().catch((err) => this.logger.warn(`rate metric flush failed: ${err}`));
      }, RATE_METRIC_FLUSH_INTERVAL_MS);
      this.rateMetricFlushTimer.unref?.();
    }
  }

  private async flushRateMetrics(): Promise<void> {
    if (!this.rateMetricBuckets.size) return;
    const batches = [...this.rateMetricBuckets.values()];
    this.rateMetricBuckets.clear();
    try {
      await this.enqueueAgentWrite('rate-metrics', async () => {
        await this.prisma.$transaction(async (tx) => {
          const delegate = (tx as unknown as { nodeRateMetric?: NodeRateMetricDelegate }).nodeRateMetric;
          if (!delegate) return;
          for (const item of batches) {
            await this.recordRateMetric(delegate, item.nodeId, item.bucketStart, item.uploadRateSum / item.sampleCount, item.downloadRateSum / item.sampleCount, item);
          }
        });
      });
    } catch (error) {
      for (const item of batches) {
        const key = `${item.nodeId}:${item.bucketStart.getTime()}`;
        const existing = this.rateMetricBuckets.get(key);
        if (!existing) {
          this.rateMetricBuckets.set(key, item);
        } else {
          existing.sampleCount += item.sampleCount;
          existing.uploadRateSum += item.uploadRateSum;
          existing.downloadRateSum += item.downloadRateSum;
          existing.uploadRatePeak = Math.max(existing.uploadRatePeak, item.uploadRatePeak);
          existing.downloadRatePeak = Math.max(existing.downloadRatePeak, item.downloadRatePeak);
        }
      }
      throw error;
    }
  }

  private async batchIncrement(
    tx: unknown,
    table: 'User' | 'Subscription',
    increments: Map<string, bigint>
  ): Promise<void> {
    if (!increments.size) return;
    const rawClient = tx as { $executeRaw?: (query: Prisma.Sql) => Promise<number> };
    if (rawClient.$executeRaw) {
      const ids = [...increments.keys()];
      const cases = [...increments.entries()].map(([id, total]) => Prisma.sql`WHEN ${id} THEN ${total}`);
      const tableName = table === 'User' ? '"User"' : '"Subscription"';
      await rawClient.$executeRaw(Prisma.sql`
        UPDATE ${Prisma.raw(tableName)}
        SET "trafficUsedBytes" = "trafficUsedBytes" + CASE "id" ${Prisma.join(cases, ' ')} ELSE 0 END
        WHERE "id" IN (${Prisma.join(ids)})
      `);
      return;
    }
    const delegate = (tx as unknown as { user?: { update: (args: Record<string, unknown>) => Promise<unknown> }; subscription?: TrafficSubscriptionDelegate });
    const target = table === 'User' ? delegate.user : delegate.subscription;
    if (!target) throw new Error(`${table} delegate is unavailable`);
    for (const [id, total] of increments) {
      await target.update({ where: { id }, data: { trafficUsedBytes: { increment: total } } });
    }
  }

  private async batchUpsertTrafficCursors(
    tx: unknown,
    nodeId: string,
    updates: Map<string, { uploadTotal: bigint; downloadTotal: bigint }>
  ): Promise<void> {
    if (!updates.size) return;
    const rawClient = tx as { $executeRaw?: (query: Prisma.Sql) => Promise<number> };
    if (rawClient.$executeRaw) {
      const updatedAt = new Date();
      const values = [...updates.entries()].map(([credential, totals]) => Prisma.sql`(
        ${randomUUID()}, ${nodeId}, ${credential}, ${totals.uploadTotal}, ${totals.downloadTotal}, ${updatedAt}
      )`);
      await rawClient.$executeRaw(Prisma.sql`
        INSERT INTO "TrafficCursor" ("id", "nodeId", "credential", "uploadTotal", "downloadTotal", "updatedAt")
        VALUES ${Prisma.join(values, ', ')}
        ON CONFLICT ("nodeId", "credential") DO UPDATE SET
          "uploadTotal" = excluded."uploadTotal",
          "downloadTotal" = excluded."downloadTotal",
          "updatedAt" = excluded."updatedAt"
      `);
      return;
    }
    const delegate = (tx as unknown as { trafficCursor?: TrafficCursorDelegate }).trafficCursor;
    if (!delegate) throw new Error('TrafficCursor delegate is unavailable');
    for (const [credential, totals] of updates) {
      await delegate.upsert({
        where: { nodeId_credential: { nodeId, credential } },
        create: { nodeId, credential, ...totals },
        update: totals
      });
    }
  }

  private getSplitRates(data: HeartbeatData): { uploadRate: number; downloadRate: number } | null {
    if (
      data.uploadRate === undefined ||
      data.downloadRate === undefined ||
      !Number.isFinite(data.uploadRate) ||
      !Number.isFinite(data.downloadRate) ||
      data.uploadRate < 0 ||
      data.downloadRate < 0
    ) {
      return null;
    }
    return { uploadRate: data.uploadRate, downloadRate: data.downloadRate };
  }

  private async recordRateMetric(
    delegate: NodeRateMetricDelegate,
    nodeId: string,
    heartbeatAt: Date,
    uploadRate: number,
    downloadRate: number,
    aggregate?: RateMetricAggregate
  ): Promise<void> {
    const bucketStart = new Date(Math.floor(heartbeatAt.getTime() / NODE_RATE_BUCKET_MS) * NODE_RATE_BUCKET_MS);
    const where = { nodeId_bucketStart: { nodeId, bucketStart } };
    const sampleCount = aggregate?.sampleCount ?? 1;
    const uploadRateSum = aggregate?.uploadRateSum ?? uploadRate;
    const downloadRateSum = aggregate?.downloadRateSum ?? downloadRate;
    const uploadRatePeak = aggregate?.uploadRatePeak ?? uploadRate;
    const downloadRatePeak = aggregate?.downloadRatePeak ?? downloadRate;
    const existing = await delegate.findUnique({ where });
    if (existing) {
      await delegate.update({
        where: { id: existing.id },
        data: {
          sampleCount: { increment: sampleCount },
          uploadRateSum: { increment: uploadRateSum },
          downloadRateSum: { increment: downloadRateSum },
          uploadRatePeak: Math.max(existing.uploadRatePeak, uploadRatePeak),
          downloadRatePeak: Math.max(existing.downloadRatePeak, downloadRatePeak)
        }
      });
    } else {
      await delegate.create({
        data: {
          nodeId,
          bucketStart,
          sampleCount,
          uploadRateSum,
          downloadRateSum,
          uploadRatePeak,
          downloadRatePeak
        }
      });
    }
  }

  // 低频清理历史速率桶，避免每个心跳都在写事务中扫描和删除历史数据。
  async cleanupOldRateMetrics(): Promise<void> {
    const delegate = (this.prisma as unknown as { nodeRateMetric?: NodeRateMetricRootDelegate }).nodeRateMetric;
    if (!delegate) return;
    const now = Date.now();
    if (now < this.nextRateMetricCleanupAt) return;
    this.nextRateMetricCleanupAt = now + RATE_METRIC_CLEANUP_INTERVAL_MS;
    try {
      const result = await this.enqueueAgentWrite('rate-cleanup', () => delegate.deleteMany({
        where: { bucketStart: { lt: new Date(now - NODE_RATE_RETENTION_MS) } }
      }));
      if (result.count > 0) {
        this.logger.log(`rate metric cleanup removed ${result.count} expired bucket(s)`);
      }
    } catch (err) {
      this.nextRateMetricCleanupAt = now + RATE_METRIC_CLEANUP_RETRY_MS;
      throw err;
    }
  }

  // HTTP 轮询适配器的单一业务入口：先处理回执，再返回配置差异与待执行任务。
  async poll(token: string | undefined, data: AgentPollDto): Promise<AgentPollResponse> {
    const auth = await this.authenticate(token);
    if (!auth.ok) {
      throw new UnauthorizedException(auth.message);
    }

    // 同一节点切换到 HTTP 后，旧 WS 连接不得继续接收任务或覆盖通信模式。
    this.supersedeSocket(auth.nodeId);
    await this.handleHeartbeat(auth.nodeId, data, 'HTTP');
    for (const result of data.configApplyResults ?? []) {
      await this.handleConfigApplyResult(auth.nodeId, result);
    }
    for (const result of data.upgradeResults ?? []) {
      await this.handleUpgradeResult(auth.nodeId, result);
    }
    for (const result of data.probeResults ?? []) {
      await this.handleProbeResult(auth.nodeId, result);
    }
    for (const result of data.restartAgentResults ?? []) {
      await this.handleRestartResult(auth.nodeId, result);
    }

    const desired = await this.getDesiredConfigSync(auth.nodeId);
    const settings = await this.settingsService?.getSettings();
    const node = await this.prisma.node.findUnique({
      where: { id: auth.nodeId },
      select: { pollIntervalSecs: true }
    });
    const nextPollSecs = Math.max(5, Math.min(300, node?.pollIntervalSecs ?? settings?.defaultPollIntervalSecs ?? 15));
    const needUpdate = data.appliedConfigVersion !== desired.version;
    return {
      protocolVersion: AGENT_PROTOCOL_VERSION,
      needUpdate,
      version: desired.version,
      singboxConfig: needUpdate ? desired.singboxConfig : null,
      tasks: await this.takePendingTasks(auth.nodeId),
      nextPollSecs
    };
  }

  // config_apply_result 回执处理：失败原因落 configError（成功清空），供管理端展示
  async handleConfigApplyResult(nodeId: string, data: ConfigApplyResultData): Promise<void> {
    const message = data.success ? null : (data.message?.slice(0, 8192) ?? 'unknown error');
    await this.enqueueAgentWrite('config-result', () => this.prisma.node
      .update({ where: { id: nodeId }, data: { configError: message } }))
      .catch((err) => this.logger.warn(`config_apply_result: ${err}`));
    if (data.success) {
      this.logger.log(`config applied: node=${nodeId} version=${data.version}`);
    } else {
      this.logger.warn(`config apply failed: node=${nodeId} version=${data.version} error=${data.message}`);
    }
  }

  async handleUpgradeResult(nodeId: string, data: UpgradeResultData): Promise<void> {
    const result = {
      taskId: data.taskId,
      type: 'upgrade',
      success: data.success,
      message: data.message,
      completedAt: new Date().toISOString()
    } satisfies TaskResult;
    this.acknowledgeTask(nodeId, data.taskId, result);
    const delegate = this.deploymentTasks();
    if (delegate) {
      const task = await delegate.findFirst({ where: { id: data.taskId, nodeId } });
      if (task) {
        await delegate.update({
          where: { id: task.id },
          data: {
            status: data.success ? 'COMPLETED' : 'FAILED',
            errorMessage: data.success ? null : data.message.slice(0, 8192),
            completedAt: new Date(result.completedAt)
          }
        });
        if (data.success) {
          const currentField = data.target === 'agent' ? 'currentAgentAssetId' : 'currentSingboxAssetId';
          await this.enqueueAgentWrite('upgrade-node-asset', () => this.prisma.node.update({
            where: { id: nodeId },
            data: { [currentField]: task.assetId }
          }));
        }
      }
    }
    const outcome = data.success ? 'succeeded' : 'failed';
    this.logger[data.success ? 'log' : 'warn'](
      `agent upgrade ${outcome}: node=${nodeId} target=${data.target} version=${data.version} task=${data.taskId} message=${data.message}`
    );
  }

  async handleProbeResult(nodeId: string, data: ProbeResultData): Promise<void> {
    const completedAt = new Date().toISOString();
    this.acknowledgeTask(nodeId, data.taskId, {
      taskId: data.taskId,
      type: 'probe',
      success: data.success,
      message: data.results.find((result) => !result.success)?.message ?? (data.success ? 'ok' : 'probe failed'),
      completedAt
    });
    await this.enqueueAgentWrite('probe-result', () => this.prisma.node.update({
      where: { id: nodeId },
      data: {
        lastProbeResult: JSON.stringify({
          taskId: data.taskId,
          success: data.success,
          results: data.results,
          completedAt
        })
      }
    }));
    this.logger.log(
      `agent probe completed: node=${nodeId} task=${data.taskId} success=${data.success} results=${data.results.length}`
    );
  }

  async handleRestartResult(nodeId: string, data: RestartAgentResultData): Promise<void> {
    this.acknowledgeTask(nodeId, data.taskId, {
      taskId: data.taskId,
      type: 'restart',
      success: data.success,
      message: data.message,
      completedAt: new Date().toISOString()
    });
    this.logger[data.success ? 'log' : 'warn'](
      `agent restart ${data.success ? 'succeeded' : 'failed'}: node=${nodeId} task=${data.taskId} message=${data.message}`
    );
  }

  handleLogReport(nodeId: string, data: LogReportData): void {
    if (!this.systemLogsService || !data?.logs) return;
    for (const item of data.logs) {
      this.systemLogsService.enqueue({
        nodeId,
        source: item.source || 'AGENT',
        level: item.level,
        module: item.module || 'Agent',
        message: item.message,
        metadata: item.metadata
      });
    }
  }

  // Line 自己拥有协议与端点：同一条 Line 在出口节点生成协议入站，
  // 中继线路再按入口角色追加盲转发或协议代理配置。
  async buildConfigSync(nodeId: string): Promise<ConfigSyncData> {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      include: {
        entryLines: {
          where: { status: 'ACTIVE' },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: {
            landingNode: true,
            certificate: true,
            targetLine: { include: { entryNode: true } },
            relaySources: {
              where: { status: 'ACTIVE' },
              select: { id: true, tagsJson: true, isPublic: true, status: true }
            }
          }
        },
        landingLines: {
          where: { status: 'ACTIVE' },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: {
            entryNode: true,
            certificate: true,
            targetLine: { include: { entryNode: true } },
            relaySources: {
              where: { status: 'ACTIVE' },
              select: { id: true, tagsJson: true, isPublic: true, status: true }
            }
          }
        }
      }
    });
    if (!node) {
      throw new NotFoundException('节点不存在');
    }

    // vless/tuic 用 uuid 登录；hy2 的 password 回退 uuid（与订阅输出一致，见 docs/DATA_MODELS.md §3.1）
    const subscriptionDelegate = (this.prisma as unknown as { subscription?: SubscriptionDelegate }).subscription;
    let entitledSubscriptions: SubscriptionSnapshot[] = [];
    const settings = await this.settingsService?.getSettings();
    const enforceEmailVerification = settings?.enforceEmailVerification ?? false;

    if (subscriptionDelegate) {
      entitledSubscriptions = await subscriptionDelegate.findMany({
        where: { status: { in: ['ACTIVE', 'CANCELED'] } },
        include: {
          user: {
            select: {
              uuid: true,
              email: true,
              role: true,
              emailVerifiedAt: true,
              password: true,
              isActive: true,
              extraLineGrants: { select: { lineId: true } }
            }
          },
          plan: { select: { lineMatchMode: true, lineTagsJson: true, lineIdsJson: true } }
        }
      });
      entitledSubscriptions = entitledSubscriptions.filter((subscription) =>
        subscription.user.isActive &&
        (!enforceEmailVerification || !!subscription.user.emailVerifiedAt || subscription.user.role === 'ADMIN') &&
        subscription.trafficUsedBytes < subscription.trafficLimitBytes &&
        (!subscription.expireAt || subscription.expireAt.getTime() > Date.now())
      );
    } else {
      const entitledUsers = await this.prisma.user.findMany({
        where: {
          isActive: true,
          ...(enforceEmailVerification ? { OR: [{ emailVerifiedAt: { not: null } }, { role: 'ADMIN' }] } : {})
        },
        select: { uuid: true, email: true, role: true, emailVerifiedAt: true, password: true, isActive: true, expireAt: true, trafficLimitBytes: true, trafficUsedBytes: true }
      });
      entitledSubscriptions = entitledUsers
        .filter(isUserEntitled)
        .map((u) => ({
          id: u.uuid,
          status: 'ACTIVE',
          trafficLimitBytes: u.trafficLimitBytes,
          trafficUsedBytes: u.trafficUsedBytes,
          expireAt: u.expireAt,
          user: { uuid: u.uuid, email: u.email, role: u.role, emailVerifiedAt: u.emailVerifiedAt, password: u.password, isActive: u.isActive }
        }));
    }

    type ConfigLine = {
      id: string;
      tag: string | null;
      listen: string;
      type: string;
      relayMode: string | null;
      protocolType: string;
      paramsJson: string;
      entryNodeId: string;
      entryPort: number;
      landingNodeId: string | null;
      landingPort: number | null;
      tagsJson: string;
      isPublic: boolean;
      status: string;
      entryNode?: { status: string };
      landingNode?: { serverHost: string; status?: string } | null;
      certificate: { certificatePem: string; privateKeyPem: string } | null;
      targetLine?: {
        id: string;
        type: string;
        protocolType: string;
        paramsJson: string;
        entryPort: number;
        status: string;
        entryNode: { serverHost: string; status?: string };
      } | null;
      relaySources?: Array<{ id: string; tagsJson: string; isPublic: boolean; status: string }>;
    };
    const lines = new Map<string, ConfigLine>();
    for (const line of node.entryLines ?? []) lines.set(line.id, line);
    for (const line of node.landingLines ?? []) {
      if (!lines.has(line.id)) {
        lines.set(line.id, { ...line, landingNode: { serverHost: node.serverHost, status: node.status } });
      }
    }

    const publicLinesEnabled = (await this.settingsService?.getSettings())?.publicLinesEnabled !== false;
    const inbounds: Array<Record<string, unknown>> = [];
    const outbounds: Array<Record<string, unknown>> = [{ type: 'direct', tag: 'direct' }];
    const relayRules: Array<Record<string, unknown>> = [];
    const authorizedUsers = new Map<string, InboundUserCredential>();
    const usersForLine = (line: Pick<ConfigLine, 'id' | 'tagsJson' | 'isPublic' | 'status'>): InboundUserCredential[] => {
      const lineUsers = entitledSubscriptions
        .filter((subscription) => {
          if (!subscription.plan) return true;
          return isLineAuthorized(
            subscription.plan,
            line,
            subscription.user.extraLineGrants?.map((grant) => grant.lineId) ?? []
          );
        })
        .map((subscription) => ({
          uuid: subscription.user.uuid,
          email: subscription.user.email,
          credential: subscription.user.password ?? subscription.user.uuid
        }));
      lineUsers.forEach((user) => authorizedUsers.set(user.uuid, user));
      return lineUsers;
    };
    for (const line of lines.values()) {
      if (!publicLinesEnabled) continue;
      const protocolType = line.protocolType as ProtocolType;
      const params = this.buildLineParams(line);
      const lineTags = resolveLineTags(line);
      const isEntry = line.entryNodeId === nodeId;
      const isLanding = line.landingNodeId === nodeId;
      const otherNodeOnline = isEntry
        ? (line.type === 'DIRECT'
            ? true
            : line.relayMode === 'TARGET_LINE'
              ? line.targetLine?.entryNode.status === 'ONLINE'
              : line.landingNode?.status === 'ONLINE')
        : line.entryNode?.status === 'ONLINE';
      if (node.status !== 'ONLINE' || !otherNodeOnline) continue;
      const users = usersForLine(line);
      const inboundUsers = line.type === 'DIRECT' && line.relaySources?.length
        ? [...new Map(
          [...users, ...line.relaySources.flatMap((source) => usersForLine(source))]
            .map((user) => [user.uuid, user] as const)
        ).values()]
        : users;
      const targetInboundUsers = line.type === 'DIRECT' && line.relaySources?.length
        ? [...inboundUsers, this.internalRelayTransitUser()]
        : inboundUsers;
      if (line.type === 'DIRECT' && isEntry) {
        inbounds.push(...buildServerInbounds({
          type: protocolType,
          tag: lineTags.direct ?? `line-${line.id}`,
          listen: line.listen || DEFAULT_INBOUND_LISTEN,
          port: line.entryPort,
          params,
          users: targetInboundUsers,
          lineId: line.id
        }));
        continue;
      }

      if (isEntry && line.relayMode === 'BLIND_FORWARD' && line.landingNode && line.landingPort) {
        inbounds.push({
          type: 'direct',
          tag: lineTags.entry ?? `relay-${line.id}-entry`,
          listen: line.listen || DEFAULT_INBOUND_LISTEN,
          listen_port: line.entryPort,
          override_address: line.landingNode.serverHost,
          override_port: line.landingPort
        });
      }

      if (isEntry && line.relayMode === 'PROTOCOL_PROXY') {
        const relayTag = lineTags.entry ?? `relay-${line.id}-entry`;
        const relayInbounds = buildServerInbounds({
          type: protocolType,
          tag: relayTag,
          listen: line.listen || DEFAULT_INBOUND_LISTEN,
          port: line.entryPort,
          params,
          users,
          lineId: line.id
        });
        inbounds.push(...relayInbounds);
        const outbound = this.buildProtocolRelayOutbound(line);
        if (!outbound) {
          inbounds.splice(-relayInbounds.length, relayInbounds.length);
          continue;
        }
        outbounds.push(outbound);
        relayRules.push({ inbound: [relayTag], outbound: `relay-out-${line.id}` });
      }

      if (isEntry && line.relayMode === 'TARGET_LINE') {
        const targetLine = line.targetLine;
        if (!targetLine || targetLine.status !== 'ACTIVE') continue;
        const relayTag = lineTags.entry ?? `relay-${line.id}-entry`;
        const relayInbounds = buildServerInbounds({
          type: protocolType,
          tag: relayTag,
          listen: line.listen || DEFAULT_INBOUND_LISTEN,
          port: line.entryPort,
          params,
          users,
          lineId: line.id
        });
        inbounds.push(...relayInbounds);
        const outbound = this.buildProtocolRelayOutbound({
          id: line.id,
          protocolType: targetLine.protocolType,
          paramsJson: targetLine.paramsJson,
          landingPort: targetLine.entryPort,
          landingNode: targetLine.entryNode
        });
        if (!outbound) {
          inbounds.splice(-relayInbounds.length, relayInbounds.length);
          continue;
        }
        outbounds.push(outbound);
        relayRules.push({ inbound: [relayTag], outbound: `relay-out-${line.id}` });
      }

      if (isLanding && !(line.type === 'RELAY' && line.relayMode === 'TARGET_LINE') && line.landingPort) {
        const exitUsers = line.type === 'RELAY' && line.relayMode === 'PROTOCOL_PROXY'
          ? [this.internalRelayTransitUser()]
          : users;
        inbounds.push(...buildServerInbounds({
          type: protocolType,
          tag: lineTags.landing ?? `line-${line.id}-landing`,
          listen: line.listen || DEFAULT_INBOUND_LISTEN,
          port: line.landingPort,
          params,
          users: exitUsers,
          lineId: line.id
        }));
      }
    }

    const statsUsers = new Set<string>();
    for (const inbound of inbounds) {
      if (Array.isArray(inbound.users)) {
        for (const user of inbound.users as Array<Record<string, unknown>>) {
          const name = typeof user.name === 'string' ? user.name : typeof user.username === 'string' ? user.username : null;
          if (name) statsUsers.add(name);
        }
      }
    }

    let singboxConfig: Record<string, unknown> = {
      log: { level: 'info', timestamp: true },
      inbounds,
      outbounds,
      experimental: {
        v2ray_api: {
          listen: getStatsApiListen(),
          stats: {
            enabled: true,
            users: [...statsUsers],
            inbounds: inbounds.map((inbound) => inbound.tag).filter((tag): tag is string => typeof tag === 'string' && tag.length > 0)
          }
        }
      },
      ...(relayRules.length ? { route: { rules: relayRules } } : {})
    };
    if (node.configOverride) {
      singboxConfig = deepMerge(singboxConfig, JSON.parse(node.configOverride) as Record<string, unknown>);
    }
    return { version: ++this.configVersion, singboxConfig };
  }

  private buildLineParams(line: {
    paramsJson: string;
    certificate?: { certificatePem: string; privateKeyPem: string } | null;
  }): Record<string, unknown> {
    const params = revealInboundSecrets(JSON.parse(line.paramsJson) as Record<string, unknown>);
    if (!line.certificate) return params;
    const tls = params.tls;
    if (!tls || typeof tls !== 'object' || Array.isArray(tls)) return params;
    return {
      ...params,
      tls: {
        ...(tls as Record<string, unknown>),
        certificate: [line.certificate.certificatePem],
        key: [decryptSecret(line.certificate.privateKeyPem)]
      }
    };
  }

  private async getDesiredConfigSync(nodeId: string): Promise<ConfigSyncData> {
    const cached = this.configCache.get(nodeId);
    if (cached) return cached;
    const payload = await this.buildConfigSync(nodeId);
    this.configCache.set(nodeId, payload);
    return payload;
  }

  private buildProtocolRelayOutbound(
    line: {
      id: string;
      protocolType: string;
      paramsJson: string;
      landingPort?: number | null;
      landingNode?: { serverHost: string } | null;
    }
  ): Record<string, unknown> | undefined {
    if (!line.landingNode || !line.landingPort) return undefined;
    const protocolType = line.protocolType as ProtocolType;
    const params = revealInboundSecrets(JSON.parse(line.paramsJson) as Record<string, unknown>);
    const tls = (params.tls ?? {}) as Record<string, unknown>;
    const reality = tls.reality as Record<string, unknown> | undefined;
    const fallbackServerName = typeof tls.serverName === 'string'
      ? tls.serverName
      : reality && Array.isArray(reality.serverNames) && typeof reality.serverNames[0] === 'string'
        ? reality.serverNames[0]
        : undefined;
    const tlsServerName = fallbackServerName;
    const outbound: Record<string, unknown> = {
      type: protocolType.toLowerCase(),
      tag: `relay-out-${line.id}`,
      server: line.landingNode.serverHost,
      server_port: line.landingPort
    };

    switch (protocolType) {
      case 'VLESS':
        outbound.uuid = INTERNAL_RELAY_TRANSIT_UUID;
        if (typeof params.flow === 'string') outbound.flow = params.flow;
        break;
      case 'VMESS':
        outbound.uuid = INTERNAL_RELAY_TRANSIT_UUID;
        outbound.alter_id = typeof params.alterId === 'number' ? params.alterId : 0;
        outbound.security = 'auto';
        break;
      case 'TROJAN':
        outbound.password = INTERNAL_RELAY_TRANSIT_SECRET;
        break;
      case 'HYSTERIA2':
        outbound.password = INTERNAL_RELAY_TRANSIT_SECRET;
        if (typeof params.upMbps === 'number') outbound.up_mbps = params.upMbps;
        if (typeof params.downMbps === 'number') outbound.down_mbps = params.downMbps;
        if (params.obfs) outbound.obfs = params.obfs;
        break;
      case 'TUIC':
        outbound.uuid = INTERNAL_RELAY_TRANSIT_UUID;
        outbound.password = INTERNAL_RELAY_TRANSIT_SECRET;
        outbound.congestion_control = typeof params.congestionControl === 'string' ? params.congestionControl : 'bbr';
        if (params.zeroRttHandshake === true) outbound.zero_rtt_handshake = true;
        break;
      case 'SHADOWSOCKS':
        outbound.method = typeof params.method === 'string' ? params.method : '2022-blake3-aes-128-gcm';
        outbound.password = params.mode === 'multi-user'
          ? buildShadowsocksClientPassword(
            outbound.method as string,
            typeof params.password === 'string' ? params.password : '',
            INTERNAL_RELAY_TRANSIT_SECRET,
            INTERNAL_RELAY_TRANSIT_UUID
          )
          : normalizeShadowsocksPassword(outbound.method as string, typeof params.password === 'string' ? params.password : '');
        break;
      case 'NAIVE':
        outbound.username = INTERNAL_RELAY_TRANSIT_EMAIL;
        outbound.password = INTERNAL_RELAY_TRANSIT_SECRET;
        break;
      case 'SHADOWTLS':
        return undefined;
      default:
        return undefined;
    }

    const clientTls = buildClientTls(
      tls as unknown as Parameters<typeof buildClientTls>[0],
      tlsServerName,
      protocolType === 'NAIVE' ? { includeAlpn: false, includeInsecure: false } : undefined
    );
    if (clientTls) outbound.tls = clientTls;
    const transport = (params.transport ?? {}) as Record<string, unknown>;
    const clientTransport = buildClientTransport(
      transport as unknown as Parameters<typeof buildClientTransport>[0],
      null
    );
    if (clientTransport) outbound.transport = clientTransport;
    return outbound;
  }

  private internalRelayTransitUser(): InboundUserCredential {
    return {
      uuid: INTERNAL_RELAY_TRANSIT_UUID,
      email: INTERNAL_RELAY_TRANSIT_EMAIL,
      credential: INTERNAL_RELAY_TRANSIT_SECRET
    };
  }

  // 向指定节点推送配置（reload 触发）
  async pushConfig(nodeId: string): Promise<boolean> {
    try {
      const payload = await this.buildConfigSync(nodeId);
      this.configCache.set(nodeId, payload);
      const socket = this.sockets.get(nodeId);
      if (!socket) {
        const node = await this.prisma.node.findUnique({
          where: { id: nodeId },
          select: { status: true, communicationMode: true }
        });
        return node?.status === 'ONLINE' && node.communicationMode === 'HTTP';
      }
      socket.send(JSON.stringify({ type: 'config_sync', data: payload }));
      return true;
    } catch (err) {
      this.logger.error(`pushConfig failed for node=${nodeId}: ${err}`);
      return false;
    }
  }

  // 用户增删/资格变动时向全部在线节点推送（协议约定见 docs/API_AND_PROTOCOLS.md §2.2）
  async pushConfigToAll(): Promise<number> {
    this.configCache.clear();
    const settings = await this.settingsService?.getSettings();
    const debounceMs = settings?.configSyncDebounceMs ?? 250;
    return new Promise((resolve) => {
      this.configPushWaiters.push(resolve);
      if (this.configPushTimer) clearTimeout(this.configPushTimer);
      this.configPushTimer = setTimeout(() => {
        this.configPushTimer = undefined;
        void this.flushConfigToAll().then((count) => {
          const waiters = this.configPushWaiters.splice(0);
          waiters.forEach((waiter) => waiter(count));
        });
      }, debounceMs);
    });
  }

  private async flushConfigToAll(): Promise<number> {
    let pushed = 0;
    for (const nodeId of this.sockets.keys()) {
      if (await this.pushConfig(nodeId)) {
        pushed += 1;
      }
    }
    if (pushed > 0) {
      this.logger.log(`config_sync pushed to ${pushed} online node(s)`);
    }
    return pushed;
  }

  async requestUpgrade(
    nodeId: string,
    target: UpgradeTarget,
    version: string,
    url: string,
    sha256: string,
    options: UpgradeTaskOptions = {}
  ) {
    if (!/^https?:\/\//i.test(url)) throw new Error('upgrade URL must use http or https');
    if (!/^[a-f0-9]{64}$/i.test(sha256)) throw new Error('upgrade sha256 must be 64 hexadecimal characters');
    const taskId = randomUUID();
    const payload: UpgradeTaskData = {
      taskId,
      target,
      version,
      url,
      sha256,
      ...(options.resourceId ? { resourceId: options.resourceId } : {}),
      ...(options.assetId ? { assetId: options.assetId } : {}),
      ...(options.operation ? { operation: options.operation } : {}),
      ...(options.files?.length ? { files: options.files } : {})
    };
    const delegate = this.deploymentTasks();
    if (delegate && options.assetId && options.releaseId) {
      await delegate.create({
        data: {
          id: taskId,
          nodeId,
          assetId: options.assetId,
          previousAssetId: options.previousAssetId ?? null,
          releaseId: options.releaseId,
          kind: target.toUpperCase(),
          operation: options.operation ?? 'UPGRADE',
          status: 'QUEUED',
          attempts: 0,
          payloadJson: JSON.stringify(payload),
          requestedById: options.requestedById ?? null
        }
      });
    }
    const sent = await this.dispatchUpgradeTask(nodeId, payload);
    return { taskId, requested: sent };
  }

  async retryUpgrade(nodeId: string, taskId: string, operatorId?: string) {
    const delegate = this.deploymentTasks();
    if (!delegate) throw new NotFoundException('升级任务不存在');
    const task = await delegate.findFirst({ where: { id: taskId, nodeId } });
    if (!task) throw new NotFoundException('升级任务不存在');
    if (!['FAILED', 'COMPLETED'].includes(task.status)) {
      return { taskId, requested: false, status: task.status };
    }
    const payload = this.parseUpgradePayload(task.payloadJson);
    await delegate.update({
      where: { id: task.id },
      data: {
        status: 'QUEUED',
        attempts: 0,
        errorMessage: null,
        completedAt: null,
        requestedById: operatorId ?? task.requestedById
      }
    });
    const requested = await this.dispatchUpgradeTask(nodeId, payload);
    return { taskId, requested };
  }

  async requestProbe(nodeId: string, probes: ProbeRequest[]) {
    if (!probes.length || probes.length > 8) throw new Error('probe task must contain 1 to 8 probes');
    const taskId = randomUUID();
    const sent = await this.sendTask(nodeId, 'probe_task', { taskId, probes });
    return { taskId, requested: sent };
  }

  async requestRestart(nodeId: string) {
    const taskId = randomUUID();
    const sent = await this.sendTask(nodeId, 'restart_agent_task', { taskId });
    return { taskId, requested: sent };
  }

  private async sendTask(nodeId: string, type: 'upgrade_task' | 'probe_task' | 'restart_agent_task', data: unknown): Promise<boolean> {
    const socket = this.sockets.get(nodeId);
    if (socket) {
      try {
        socket.send(JSON.stringify({ type, data }));
        return true;
      } catch (err) {
        this.logger.warn(`send agent task failed: node=${nodeId} type=${type} error=${err}`);
        return false;
      }
    }

    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: { status: true, communicationMode: true }
    });
    if (node?.status !== 'ONLINE' || node.communicationMode !== 'HTTP') return false;
    const task = { type, data } as AgentTaskMessage;
    const tasks = this.pendingTasks.get(nodeId) ?? [];
    tasks.push({ ...task, deliveredAt: 0 } as PendingTask);
    this.pendingTasks.set(nodeId, tasks);
    return true;
  }

  private async dispatchUpgradeTask(nodeId: string, payload: UpgradeTaskData): Promise<boolean> {
    const socket = this.sockets.get(nodeId);
    if (socket) {
      try {
        socket.send(JSON.stringify({ type: 'upgrade_task', data: payload }));
        await this.markDeploymentDispatched(payload.taskId);
        return true;
      } catch (err) {
        this.logger.warn(`send upgrade task failed: node=${nodeId} error=${err}`);
        return false;
      }
    }
    const node = await this.prisma.node.findUnique({ where: { id: nodeId }, select: { status: true, communicationMode: true } });
    return node?.status === 'ONLINE' && node.communicationMode === 'HTTP';
  }

  private async takePendingTasks(nodeId: string): Promise<AgentTaskMessage[]> {
    const result: AgentTaskMessage[] = [];
    const tasks = this.pendingTasks.get(nodeId) ?? [];
    const now = Date.now();
    const selected = tasks.filter((task) => task.deliveredAt === 0 || now - task.deliveredAt >= 60_000).slice(0, 8);
    selected.forEach((task) => { task.deliveredAt = now; });
    result.push(...selected.map((task): AgentTaskMessage => {
      if (task.type === 'upgrade_task') return { type: 'upgrade_task', data: task.data };
      if (task.type === 'probe_task') return { type: 'probe_task', data: task.data };
      return { type: 'restart_agent_task', data: task.data };
    }));
    const delegate = this.deploymentTasks();
    if (!delegate || result.length >= 8) return result.slice(0, 8);
    const persistent = await delegate.findMany({
      where: { nodeId, status: { in: ['QUEUED', 'DISPATCHED'] } },
      orderBy: { requestedAt: 'asc' },
      take: 8
    });
    for (const task of persistent) {
      if (result.length >= 8) break;
      if (task.status === 'DISPATCHED' && task.dispatchedAt && now - task.dispatchedAt.getTime() < 60_000) continue;
      const payload = this.parseUpgradePayload(task.payloadJson);
      await this.markDeploymentDispatched(task.id);
      result.push({ type: 'upgrade_task', data: payload });
    }
    return result;
  }

  private acknowledgeTask(nodeId: string, taskId: string, result: TaskResult) {
    const tasks = this.pendingTasks.get(nodeId);
    if (tasks) {
      const remaining = tasks.filter((task) => {
        const candidate = task.data as { taskId?: string };
        return candidate.taskId !== taskId;
      });
      if (remaining.length) this.pendingTasks.set(nodeId, remaining);
      else this.pendingTasks.delete(nodeId);
    }
    this.taskResults.set(`${nodeId}:${taskId}`, result);
  }

  getTaskStatus(nodeId: string, taskId: string) {
    const result = this.taskResults.get(`${nodeId}:${taskId}`);
    if (result) return { ...result, status: result.success ? 'COMPLETED' as const : 'FAILED' as const };
    const queued = (this.pendingTasks.get(nodeId) ?? []).some((task) => (task.data as { taskId?: string }).taskId === taskId);
    return { taskId, status: queued ? 'QUEUED' as const : 'PENDING' as const };
  }

  async getPersistedTaskStatus(nodeId: string, taskId: string) {
    const cached = this.getTaskStatus(nodeId, taskId);
    const delegate = this.deploymentTasks();
    if (!delegate) return cached;
    const task = await delegate.findFirst({ where: { id: taskId, nodeId } });
    if (!task) return cached;
    return {
      taskId,
      status: task.status as 'QUEUED' | 'DISPATCHED' | 'COMPLETED' | 'FAILED',
      success: task.status === 'COMPLETED' ? true : task.status === 'FAILED' ? false : undefined,
      message: task.errorMessage ?? undefined,
      attempts: task.attempts,
      requestedAt: task.requestedAt,
      dispatchedAt: task.dispatchedAt,
      completedAt: task.completedAt
    };
  }

  private deploymentTasks(): DeploymentTaskDelegate | undefined {
    return (this.prisma as unknown as { binaryDeploymentTask?: DeploymentTaskDelegate }).binaryDeploymentTask;
  }

  private parseUpgradePayload(raw: string): UpgradeTaskData {
    const parsed = JSON.parse(raw) as UpgradeTaskData;
    if (!parsed.taskId || !parsed.target || !parsed.version || !parsed.url || !parsed.sha256) {
      throw new Error('升级任务数据损坏');
    }
    return parsed;
  }

  private async markDeploymentDispatched(taskId: string): Promise<void> {
    const delegate = this.deploymentTasks();
    if (!delegate) return;
    const task = await delegate.findUnique({ where: { id: taskId } });
    if (!task) return;
    await delegate.update({
      where: { id: taskId },
      data: { status: 'DISPATCHED', attempts: task.attempts + 1, dispatchedAt: new Date() }
    });
  }

  private async dispatchQueuedUpgradeTasks(nodeId: string): Promise<void> {
    const delegate = this.deploymentTasks();
    if (!delegate || !this.sockets.has(nodeId)) return;
    const tasks = await delegate.findMany({ where: { nodeId, status: { in: ['QUEUED', 'DISPATCHED'] } }, orderBy: { requestedAt: 'asc' }, take: 8 });
    for (const task of tasks) {
      try {
        await this.dispatchUpgradeTask(nodeId, this.parseUpgradePayload(task.payloadJson));
      } catch (err) {
        this.logger.warn(`dispatch restored upgrade task failed: node=${nodeId} task=${task.id} error=${err}`);
      }
    }
  }

  // 断开：置离线并移除注册
  async unregister(nodeId: string, socket?: AgentSocket): Promise<void> {
    if (socket && this.sockets.get(nodeId) !== socket) {
      return;
    }
    this.sockets.delete(nodeId);
    this.logger.log(`agent offline: nodeId=${nodeId}`);
  }

  isCurrentSocket(nodeId: string, socket: AgentSocket): boolean {
    return this.sockets.get(nodeId) === socket;
  }

  private supersedeSocket(nodeId: string): void {
    const socket = this.sockets.get(nodeId);
    if (!socket) return;
    this.sockets.delete(nodeId);
    try {
      socket.close(4002, 'switched to HTTP polling');
    } catch (err) {
      this.logger.warn(`close superseded agent socket failed: node=${nodeId} error=${err}`);
    }
    this.logger.log(`agent WS superseded by HTTP polling: node=${nodeId}`);
  }

  // 节点删除前断开其在线 Agent：只移除注册与关闭连接，不写库（节点即将删除）
  disconnectNode(nodeId: string): boolean {
    const socket = this.sockets.get(nodeId);
    if (!socket) {
      return false;
    }
    this.sockets.delete(nodeId);
    socket.close(4001, 'node deleted');
    this.logger.log(`agent disconnected: node=${nodeId} (deleted)`);
    return true;
  }

  // 心跳超时扫描：超过阈值未心跳的在线节点置离线
  async sweepStaleNodes(): Promise<void> {
    const settings = await this.settingsService?.getSettings();
    const heartbeatTimeoutMs = (settings?.heartbeatTimeoutSecs ?? 15) * 1000;
    const nodes = await this.prisma.node.findMany({
      where: { status: 'ONLINE' },
      select: { id: true, communicationMode: true, pollIntervalSecs: true, lastSeenAt: true }
    });
    const now = Date.now();
    const staleNodes = nodes
      .filter((node) => {
        if (!node.lastSeenAt) return true;
        const thresholdMs = node.communicationMode === 'HTTP'
          ? Math.max(heartbeatTimeoutMs, node.pollIntervalSecs * 3_000)
          : heartbeatTimeoutMs;
        return now - node.lastSeenAt.getTime() > thresholdMs;
      })
    if (staleNodes.length) {
      await this.enqueueAgentWrite('stale-sweep', () => this.prisma.node.updateMany({
        where: {
          OR: staleNodes.map((node) => ({
            id: node.id,
            status: 'ONLINE',
            lastSeenAt: node.lastSeenAt
          }))
        },
        data: { status: 'OFFLINE', bandwidthRate: null, uploadRate: null, downloadRate: null }
      }));
    }
  }

  onModuleDestroy() {
    if (this.configPushTimer) clearTimeout(this.configPushTimer);
    this.configPushWaiters.splice(0).forEach((waiter) => waiter(0));
    for (const [, socket] of this.sockets) {
      socket.close(1001, 'server shutdown');
    }
    this.sockets.clear();
    this.pendingTasks.clear();
    this.taskResults.clear();
    this.configCache.clear();
    this.pendingHeartbeats.clear();
    for (const timer of this.heartbeatRetryTimers.values()) clearTimeout(timer);
    this.heartbeatRetryTimers.clear();
    this.rateMetricBuckets.clear();
    if (this.rateMetricFlushTimer) clearTimeout(this.rateMetricFlushTimer);
  }
}

// 旧名称作为导出别名保留，避免已有测试和扩展模块被无意义地打断。
export { AgentService as AgentGatewayService };
