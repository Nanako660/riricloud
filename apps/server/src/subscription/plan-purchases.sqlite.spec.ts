import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PlanPurchasesService } from './plan-purchases.service';

describe('PlanPurchasesService SQLite concurrency', () => {
  jest.setTimeout(120_000);

  let tempDir: string;
  let prisma: PrismaClient;
  let service: PlanPurchasesService;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret-for-plan-purchases-0123456789';
    tempDir = await mkdtemp(join(tmpdir(), 'riricloud-purchase-'));
    const databaseUrl = `file:${join(tempDir, 'purchase.db').replaceAll('\\', '/')}`;
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
    await createMinimalSchema();
    service = new PlanPurchasesService(prisma as never);

    await prisma.$executeRawUnsafe(
      `INSERT INTO "PlanPurchaseIdentity" ("id") VALUES ('identity-1')`
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "User" ("id","email","planPurchaseIdentityId")
       VALUES ('user-1','concurrency@example.com','identity-1')`
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "PlanPurchaseEmailAlias" ("id","identityId","emailHash")
       VALUES ('alias-1','identity-1','alias-for-identity-1')`
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  async function createMinimalSchema() {
    const statements = [
      `CREATE TABLE "User" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "email" TEXT NOT NULL,
        "planPurchaseIdentityId" TEXT
      )`,
      `CREATE TABLE "PlanPurchaseIdentity" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE "PlanPurchaseEmailAlias" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "identityId" TEXT NOT NULL,
        "emailHash" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE UNIQUE INDEX "PlanPurchaseEmailAlias_emailHash_key" ON "PlanPurchaseEmailAlias"("emailHash")`,
      `CREATE TABLE "PlanPurchase" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "identityId" TEXT NOT NULL,
        "planId" TEXT NOT NULL,
        "sequence" INTEGER NOT NULL,
        "source" TEXT NOT NULL,
        "subscriptionId" TEXT,
        "purchasedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE UNIQUE INDEX "PlanPurchase_identityId_planId_sequence_key" ON "PlanPurchase"("identityId","planId","sequence")`
    ];
    for (const statement of statements) {
      await prisma.$executeRawUnsafe(statement);
    }
  }

  it('并发领取同一免费套餐时仅一条成功，另一条转为 409', async () => {
    const results = await Promise.allSettled([
      service.claim('user-1', { id: 'plan-free', purchaseLimitPerUser: 1 }, 'SELF_BUY', null),
      service.claim('user-1', { id: 'plan-free', purchaseLimitPerUser: 1 }, 'SELF_BUY', null)
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((result) => result.status === 'rejected') as PromiseRejectedResult[];
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ status: 409 });
    expect(await prisma.planPurchase.count({ where: { identityId: 'identity-1', planId: 'plan-free' } })).toBe(1);
  });

  it('取消或过期后再次领取同一免费套餐仍被拒绝', async () => {
    await expect(
      service.claim('user-1', { id: 'plan-free', purchaseLimitPerUser: 1 }, 'SELF_BUY', null)
    ).rejects.toMatchObject({ status: 409 });
  });

  it('管理员破例发放会写入第二条台账记录', async () => {
    await service.claim(
      'user-1',
      { id: 'plan-free', purchaseLimitPerUser: 1 },
      'ADMIN',
      null,
      prisma,
      { allowExceedLimit: true }
    );

    const rows = await prisma.planPurchase.findMany({
      where: { identityId: 'identity-1', planId: 'plan-free' },
      orderBy: { sequence: 'asc' }
    });
    expect(rows.map((row) => row.sequence)).toEqual([1, 2]);
    expect(rows[1].source).toBe('ADMIN');
  });
});
