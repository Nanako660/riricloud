import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { RedeemCodesService } from './redeem-codes.service';

describe('Redeem code SQLite integration', () => {
  jest.setTimeout(60_000);

  let tempDir: string;
  let prisma: PrismaClient;
  let service: RedeemCodesService;
  const wallet = {
    generateCode: jest.fn(),
    assertRedeemRateLimit: jest.fn(),
    applyBalanceChange: jest.fn().mockResolvedValue({ balance: 100, transaction: { id: 'tx' } })
  };
  const subscriptions = { activateRedeemedPlan: jest.fn(), notifyFulfillmentCompleted: jest.fn() };
  const purchases = { ensureIdentityForUser: jest.fn().mockResolvedValue('shared-identity') };

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'riricloud-redeem-codes-'));
    prisma = new PrismaClient({ datasources: { db: { url: `file:${join(tempDir, 'quota.db').replaceAll('\\', '/')}` } } });
    await prisma.$connect();
    await prisma.$executeRawUnsafe(`CREATE TABLE "PlanPurchaseIdentity" (
      "id" TEXT NOT NULL PRIMARY KEY, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await prisma.$executeRawUnsafe(`CREATE TABLE "RedeemCodeCategory" (
      "id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL UNIQUE, "tagsJson" TEXT NOT NULL DEFAULT '[]',
      "rewardType" TEXT NOT NULL DEFAULT 'BALANCE', "rewardAmount" INTEGER, "planId" TEXT,
      "limitPerIdentity" INTEGER DEFAULT 1, "isActive" BOOLEAN NOT NULL DEFAULT 1,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await prisma.$executeRawUnsafe(`CREATE TABLE "RedeemCodeCategoryUsage" (
      "identityId" TEXT NOT NULL, "categoryId" TEXT NOT NULL, "usedCount" INTEGER NOT NULL DEFAULT 0,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY ("identityId", "categoryId"),
      FOREIGN KEY ("identityId") REFERENCES "PlanPurchaseIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      FOREIGN KEY ("categoryId") REFERENCES "RedeemCodeCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )`);
    await prisma.$executeRawUnsafe(`CREATE TABLE "RedeemCode" (
      "id" TEXT NOT NULL PRIMARY KEY, "code" TEXT NOT NULL UNIQUE, "amount" INTEGER NOT NULL DEFAULT 0,
      "categoryId" TEXT, "rewardType" TEXT NOT NULL DEFAULT 'BALANCE', "rewardSnapshotJson" TEXT,
      "planId" TEXT, "status" TEXT NOT NULL DEFAULT 'UNUSED', "expiresAt" DATETIME, "note" TEXT,
      "redeemedAt" DATETIME, "redeemedByUserId" TEXT, "deletedAt" DATETIME, "deletedByUserId" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("categoryId") REFERENCES "RedeemCodeCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )`);
    await prisma.$executeRawUnsafe(`INSERT INTO "PlanPurchaseIdentity" ("id") VALUES ('shared-identity')`);
    await prisma.$executeRawUnsafe(`INSERT INTO "RedeemCodeCategory" ("id", "name", "limitPerIdentity", "updatedAt") VALUES ('cat', '一次性', 1, CURRENT_TIMESTAMP)`);
    for (const [id, code] of [['rc1', 'CODE-1'], ['rc2', 'CODE-2']]) {
      await prisma.$executeRawUnsafe(`INSERT INTO "RedeemCode" ("id", "code", "amount", "categoryId", "rewardType", "rewardSnapshotJson", "updatedAt") VALUES ('${id}', '${code}', 100, 'cat', 'BALANCE', '{"type":"BALANCE","amount":100}', CURRENT_TIMESTAMP)`);
    }
    service = new RedeemCodesService(
      prisma as never,
      wallet as never,
      subscriptions as never,
      purchases as never
    );
  });

  beforeEach(async () => {
    await prisma.redeemCodeCategoryUsage.deleteMany();
    await prisma.redeemCodeCategory.update({ where: { id: 'cat' }, data: { limitPerIdentity: 1 } });
    await prisma.redeemCode.updateMany({ data: { status: 'UNUSED', redeemedAt: null, redeemedByUserId: null } });
    wallet.applyBalanceChange.mockClear();
    purchases.ensureIdentityForUser.mockClear();
    purchases.ensureIdentityForUser.mockResolvedValue('shared-identity');
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it('Prisma SQLite 可正常创建不关联套餐的余额分类', async () => {
    const category = await service.createCategory({
      name: `余额分类-${Date.now()}`,
      tags: ['integration'],
      rewardType: 'BALANCE',
      rewardAmount: 1000
    });

    expect(category).toMatchObject({ rewardType: 'BALANCE', rewardAmount: 1000, planId: null, tags: ['integration'] });
  });

  it('真实 SQLite 中不同账号并发兑换同分类卡密不能突破购买身份上限', async () => {
    const results = await Promise.allSettled([
      service.redeem('user-a', 'CODE-1'),
      service.redeem('user-b', 'CODE-2')
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.redeemCodeCategoryUsage.findUnique({ where: { identityId_categoryId: { identityId: 'shared-identity', categoryId: 'cat' } } })).toMatchObject({ usedCount: 1 });
    expect(await prisma.redeemCode.count({ where: { status: 'REDEEMED' } })).toBe(1);
    expect(wallet.applyBalanceChange).toHaveBeenCalledTimes(1);
  });

  it('不限额分类仍累计成功兑换，之后收紧限额时历史兑换会被计入', async () => {
    await prisma.redeemCodeCategory.update({ where: { id: 'cat' }, data: { limitPerIdentity: null } });
    await service.redeem('user-a', 'CODE-1');
    expect(await prisma.redeemCodeCategoryUsage.findUnique({ where: { identityId_categoryId: { identityId: 'shared-identity', categoryId: 'cat' } } })).toMatchObject({ usedCount: 1 });

    await prisma.redeemCodeCategory.update({ where: { id: 'cat' }, data: { limitPerIdentity: 1 } });
    await expect(service.redeem('user-b', 'CODE-2')).rejects.toThrow('该购买身份已达到此分类的卡密兑换上限');
    expect(await prisma.redeemCode.findUnique({ where: { code: 'CODE-2' } })).toMatchObject({ status: 'UNUSED', redeemedByUserId: null });
    expect(wallet.applyBalanceChange).toHaveBeenCalledTimes(1);
  });

  it('真实 SQLite 中并发兑换同一卡密只履约一次', async () => {
    const results = await Promise.allSettled([
      service.redeem('user-a', 'CODE-1'),
      service.redeem('user-a', 'CODE-1')
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.redeemCodeCategoryUsage.findUnique({ where: { identityId_categoryId: { identityId: 'shared-identity', categoryId: 'cat' } } })).toMatchObject({ usedCount: 1 });
    expect(await prisma.redeemCode.count({ where: { status: 'REDEEMED' } })).toBe(1);
    expect(wallet.applyBalanceChange).toHaveBeenCalledTimes(1);
  });

  it('迁移将旧卡归入不限额历史分类且不改变兑换/账务字段', async () => {
    const migrationDir = join(__dirname, '../../prisma/migrations/20260923110000_redeem_code_categories_and_soft_delete');
    const migration = await readFile(join(migrationDir, 'migration.sql'), 'utf8');
    const url = `file:${join(tempDir, 'legacy.db').replaceAll('\\', '/')}`;
    const legacy = new PrismaClient({ datasources: { db: { url } } });
    try {
      await legacy.$connect();
      await legacy.$executeRawUnsafe('CREATE TABLE "Plan" ("id" TEXT NOT NULL PRIMARY KEY)');
      await legacy.$executeRawUnsafe('CREATE TABLE "PlanPurchaseIdentity" ("id" TEXT NOT NULL PRIMARY KEY)');
      await legacy.$executeRawUnsafe(`CREATE TABLE "RedeemCode" ("id" TEXT NOT NULL PRIMARY KEY, "code" TEXT NOT NULL UNIQUE, "amount" INTEGER NOT NULL DEFAULT 0, "status" TEXT NOT NULL DEFAULT 'UNUSED', "expiresAt" DATETIME, "note" TEXT, "redeemedAt" DATETIME, "redeemedByUserId" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
      await legacy.$executeRawUnsafe('CREATE TABLE "Subscription" ("id" TEXT NOT NULL PRIMARY KEY)');
      await legacy.$executeRawUnsafe(`INSERT INTO "RedeemCode" ("id", "code", "amount", "status", "redeemedAt", "redeemedByUserId", "note") VALUES ('old1', 'OLD-1', 875, 'REDEEMED', '2026-01-02T03:04:05.000Z', 'user-old', 'audit')`);
      for (const statement of migration.split(';').map((item) => item.trim()).filter(Boolean)) await legacy.$executeRawUnsafe(statement);
      const rows = await legacy.$queryRawUnsafe<Array<{ id: string; amount: number; status: string; redeemedAt: string; redeemedByUserId: string; categoryId: string; rewardSnapshotJson: string }>>('SELECT "id", "amount", "status", "redeemedAt", "redeemedByUserId", "categoryId", "rewardSnapshotJson" FROM "RedeemCode"');
      const categories = await legacy.$queryRawUnsafe<Array<{ id: string; limitPerIdentity: number | null; isActive: number }>>('SELECT "id", "limitPerIdentity", "isActive" FROM "RedeemCodeCategory"');
      expect(rows[0]).toMatchObject({ id: 'old1', amount: 875, status: 'REDEEMED', redeemedByUserId: 'user-old', categoryId: 'legacy-redeem-code-category', rewardSnapshotJson: '{"type":"BALANCE","amount":875}' });
      expect(new Date(rows[0].redeemedAt).toISOString()).toBe('2026-01-02T03:04:05.000Z');
      expect(categories).toEqual([{ id: 'legacy-redeem-code-category', limitPerIdentity: null, isActive: false }]);
    } finally {
      await legacy.$disconnect();
    }
  });
});
