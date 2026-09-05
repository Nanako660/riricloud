import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { AgentService } from './agent-gateway.service';

describe('AgentService SQLite traffic accounting', () => {
  jest.setTimeout(120_000);

  let tempDir: string;
  let prisma: PrismaClient;
  let service: AgentService;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'riricloud-traffic-'));
    const databasePath = join(tempDir, 'integration.db');
    const databaseUrl = `file:${databasePath.replaceAll('\\', '/')}`;

    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
    await createMinimalTrafficSchema();
    await prisma.node.create({
      data: { id: 'node-1', name: 'integration node', serverHost: '127.0.0.1', agentToken: 'token-1' }
    });
    await prisma.user.create({
      data: {
        id: 'user-1',
        email: 'integration@example.com',
        passwordHash: 'hash',
        uuid: 'user-uuid-1',
        trafficLimitBytes: 9_000_000_000_000_000_000n
      }
    });
    await prisma.user.create({
      data: {
        id: 'rollback-user',
        email: 'rollback@example.com',
        passwordHash: 'hash',
        uuid: 'rollback-credential',
        trafficLimitBytes: 1_000_000n
      }
    });
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "TrafficCursor_rollback_test"
      BEFORE INSERT ON "TrafficCursor"
      WHEN NEW."credential" = 'rollback-credential'
      BEGIN
        SELECT RAISE(ABORT, 'forced traffic cursor failure');
      END;
    `);
    service = new AgentService(prisma as never);
  });

  async function createMinimalTrafficSchema() {
    const statements = [
      `CREATE TABLE "Node" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "serverHost" TEXT NOT NULL,
        "isLocal" BOOLEAN NOT NULL DEFAULT 0,
        "configOverride" TEXT,
        "agentToken" TEXT NOT NULL,
        "communicationMode" TEXT NOT NULL DEFAULT 'WS',
        "pollIntervalSecs" INTEGER NOT NULL DEFAULT 15,
        "status" TEXT NOT NULL DEFAULT 'OFFLINE',
        "lastSeenAt" DATETIME,
        "cpuUsage" REAL,
        "memoryUsage" REAL,
        "bandwidthRate" REAL,
        "uploadRate" REAL,
        "downloadRate" REAL,
        "kernelRunning" BOOLEAN,
        "configError" TEXT,
        "lastProbeResult" TEXT,
        "agentVersion" TEXT,
        "agentProtocolVersion" INTEGER,
        "currentAgentAssetId" TEXT,
        "currentSingboxAssetId" TEXT,
        "osArch" TEXT,
        "kernelVersion" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE "User" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "uid" INTEGER,
        "nickname" TEXT,
        "email" TEXT NOT NULL,
        "passwordHash" TEXT NOT NULL,
        "role" TEXT NOT NULL DEFAULT 'USER',
        "balance" INTEGER NOT NULL DEFAULT 0,
        "trafficLimitBytes" BIGINT NOT NULL DEFAULT 0,
        "trafficUsedBytes" BIGINT NOT NULL DEFAULT 0,
        "expireAt" DATETIME,
        "subscriptionToken" TEXT NOT NULL,
        "uuid" TEXT NOT NULL,
        "password" TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT 1,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE "Line" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "entryNodeId" TEXT NOT NULL,
        "landingNodeId" TEXT,
        "type" TEXT NOT NULL DEFAULT 'DIRECT',
        "relayMode" TEXT,
        "trafficRate" REAL NOT NULL DEFAULT 1,
        "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE "Plan" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "durationDays" INTEGER NOT NULL,
        "trafficResetMode" TEXT NOT NULL DEFAULT 'NONE'
      )`,
      `CREATE TABLE "Subscription" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "planId" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "trafficLimitBytes" BIGINT NOT NULL DEFAULT 0,
        "trafficUsedBytes" BIGINT NOT NULL DEFAULT 0,
        "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expireAt" DATETIME,
        "subscriptionToken" TEXT NOT NULL,
        "canceledAt" DATETIME,
        "trafficPeriodStartAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE RESTRICT,
        FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE
      )`,
      `CREATE TABLE "TrafficLog" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "nodeId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "lineId" TEXT,
        "upload" BIGINT NOT NULL DEFAULT 0,
        "download" BIGINT NOT NULL DEFAULT 0,
        "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("nodeId") REFERENCES "Node" ("id") ON DELETE CASCADE,
        FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE,
        FOREIGN KEY ("lineId") REFERENCES "Line" ("id") ON DELETE SET NULL
      )`,
      `CREATE TABLE "TrafficCursor" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "nodeId" TEXT NOT NULL,
        "credential" TEXT NOT NULL,
        "uploadTotal" BIGINT NOT NULL DEFAULT 0,
        "downloadTotal" BIGINT NOT NULL DEFAULT 0,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("nodeId") REFERENCES "Node" ("id") ON DELETE CASCADE
      )`,
      `CREATE UNIQUE INDEX "TrafficCursor_nodeId_credential_key" ON "TrafficCursor" ("nodeId", "credential")`
    ];
    for (const statement of statements) {
      await prisma.$executeRawUnsafe(statement);
    }
  }

  afterAll(async () => {
    service?.onModuleDestroy();
    await prisma?.$disconnect();
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it('真实 SQLite 能幂等处理大整数累计快照和并发重复快照', async () => {
    const firstUpload = 9_007_199_254_740_993n;
    const firstDownload = 9_007_199_254_740_994n;
    await service.handleHeartbeat('node-1', {
      protocolVersion: 2,
      cpuUsage: 1,
      memoryUsage: 2,
      bandwidthRate: 3,
      trafficSnapshots: [{ userUuid: 'user-uuid-1', uploadTotal: firstUpload.toString(), downloadTotal: firstDownload.toString() }]
    });

    await service.handleHeartbeat('node-1', {
      protocolVersion: 2,
      cpuUsage: 1,
      memoryUsage: 2,
      bandwidthRate: 3,
      trafficSnapshots: [{ userUuid: 'user-uuid-1', uploadTotal: (firstUpload + 5n).toString(), downloadTotal: (firstDownload + 7n).toString() }]
    });

    await Promise.all(Array.from({ length: 12 }, () => service.handleHeartbeat('node-1', {
      protocolVersion: 2,
      cpuUsage: 1,
      memoryUsage: 2,
      bandwidthRate: 3,
      trafficSnapshots: [{ userUuid: 'user-uuid-1', uploadTotal: (firstUpload + 105n).toString(), downloadTotal: (firstDownload + 107n).toString() }]
    })));

    const user = await prisma.user.findUniqueOrThrow({ where: { id: 'user-1' } });
    const cursor = await prisma.trafficCursor.findUniqueOrThrow({ where: { nodeId_credential: { nodeId: 'node-1', credential: 'user-uuid-1' } } });
    const logs = await prisma.trafficLog.findMany({ where: { nodeId: 'node-1', userId: 'user-1' }, orderBy: { recordedAt: 'asc' } });

    expect(user.trafficUsedBytes).toBe(firstUpload + firstDownload + 12n + 200n);
    expect(cursor.uploadTotal).toBe(firstUpload + 105n);
    expect(cursor.downloadTotal).toBe(firstDownload + 107n);
    expect(logs.map((log) => [log.upload, log.download])).toEqual([
      [firstUpload, firstDownload],
      [5n, 7n],
      [100n, 100n]
    ]);
  });

  it('账务事务失败时 TrafficLog、配额和游标全部回滚', async () => {
    await expect(service.handleHeartbeat('node-1', {
      protocolVersion: 2,
      cpuUsage: 1,
      memoryUsage: 2,
      bandwidthRate: 3,
      trafficSnapshots: [{ userUuid: 'rollback-credential', uploadTotal: '10', downloadTotal: '20' }]
    })).rejects.toThrow('forced traffic cursor failure');

    const user = await prisma.user.findUniqueOrThrow({ where: { id: 'rollback-user' } });
    const cursor = await prisma.trafficCursor.findUnique({ where: { nodeId_credential: { nodeId: 'node-1', credential: 'rollback-credential' } } });
    const logs = await prisma.trafficLog.findMany({ where: { nodeId: 'node-1', userId: 'rollback-user' } });

    expect(user.trafficUsedBytes).toBe(0n);
    expect(cursor).toBeNull();
    expect(logs).toHaveLength(0);
    service.onModuleDestroy();
  });
});
