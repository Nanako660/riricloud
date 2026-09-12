-- CreateTable
CREATE TABLE "PlanPurchaseIdentity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PlanPurchaseEmailAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identityId" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanPurchaseEmailAlias_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "PlanPurchaseIdentity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlanPurchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identityId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "purchasedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanPurchase_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "PlanPurchaseIdentity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlanPurchase_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlanPurchase_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Plan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL DEFAULT 0,
    "durationDays" INTEGER NOT NULL,
    "trafficLimitBytes" BIGINT NOT NULL,
    "trafficResetMode" TEXT NOT NULL DEFAULT 'NONE',
    "lineMatchMode" TEXT NOT NULL DEFAULT 'ALL',
    "lineTagsJson" TEXT NOT NULL DEFAULT '[]',
    "lineIdsJson" TEXT NOT NULL DEFAULT '[]',
    "templateId" TEXT,
    "badgeText" TEXT,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "featuresJson" TEXT NOT NULL DEFAULT '[]',
    "cardConfigJson" TEXT NOT NULL DEFAULT '{}',
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "purchaseLimitPerUser" INTEGER,
    "allowRenewal" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Plan_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SubscriptionTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Plan" ("badgeText", "cardConfigJson", "createdAt", "description", "durationDays", "featuresJson", "id", "isFeatured", "isPublic", "lineIdsJson", "lineMatchMode", "lineTagsJson", "name", "price", "sortOrder", "templateId", "trafficLimitBytes", "trafficResetMode", "updatedAt") SELECT "badgeText", "cardConfigJson", "createdAt", "description", "durationDays", "featuresJson", "id", "isFeatured", "isPublic", "lineIdsJson", "lineMatchMode", "lineTagsJson", "name", "price", "sortOrder", "templateId", "trafficLimitBytes", "trafficResetMode", "updatedAt" FROM "Plan";
DROP TABLE "Plan";
ALTER TABLE "new_Plan" RENAME TO "Plan";
CREATE INDEX "Plan_isPublic_idx" ON "Plan"("isPublic");
CREATE INDEX "Plan_sortOrder_idx" ON "Plan"("sortOrder");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "uid" INTEGER,
    "nickname" TEXT,
    "email" TEXT NOT NULL,
    "emailVerifiedAt" DATETIME,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "balance" INTEGER NOT NULL DEFAULT 0,
    "trafficLimitBytes" BIGINT NOT NULL DEFAULT 107374182400,
    "trafficUsedBytes" BIGINT NOT NULL DEFAULT 0,
    "expireAt" DATETIME,
    "subscriptionToken" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "password" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "planPurchaseIdentityId" TEXT,
    CONSTRAINT "User_planPurchaseIdentityId_fkey" FOREIGN KEY ("planPurchaseIdentityId") REFERENCES "PlanPurchaseIdentity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("balance", "createdAt", "email", "emailVerifiedAt", "expireAt", "id", "isActive", "nickname", "password", "passwordHash", "role", "sessionVersion", "subscriptionToken", "trafficLimitBytes", "trafficUsedBytes", "uid", "updatedAt", "uuid") SELECT "balance", "createdAt", "email", "emailVerifiedAt", "expireAt", "id", "isActive", "nickname", "password", "passwordHash", "role", "sessionVersion", "subscriptionToken", "trafficLimitBytes", "trafficUsedBytes", "uid", "updatedAt", "uuid" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_uid_key" ON "User"("uid");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_subscriptionToken_key" ON "User"("subscriptionToken");
CREATE UNIQUE INDEX "User_uuid_key" ON "User"("uuid");
CREATE INDEX "User_role_idx" ON "User"("role");
CREATE INDEX "User_isActive_idx" ON "User"("isActive");
CREATE INDEX "User_planPurchaseIdentityId_idx" ON "User"("planPurchaseIdentityId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PlanPurchaseEmailAlias_emailHash_key" ON "PlanPurchaseEmailAlias"("emailHash");

-- CreateIndex
CREATE INDEX "PlanPurchaseEmailAlias_identityId_idx" ON "PlanPurchaseEmailAlias"("identityId");

-- CreateIndex
CREATE INDEX "PlanPurchase_identityId_planId_idx" ON "PlanPurchase"("identityId", "planId");

-- CreateIndex
CREATE INDEX "PlanPurchase_planId_idx" ON "PlanPurchase"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanPurchase_identityId_planId_sequence_key" ON "PlanPurchase"("identityId", "planId", "sequence");

-- 既有用户直接复用自身 UUID 作为稳定购买身份，避免迁移阶段需要邮箱 HMAC 密钥。
INSERT INTO "PlanPurchaseIdentity" ("id", "createdAt", "updatedAt")
SELECT "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "User";

UPDATE "User" SET "planPurchaseIdentityId" = "id";

-- 所有存量免费套餐采用安全默认：每人限一次且不可续费。
UPDATE "Plan" SET "purchaseLimitPerUser" = 1, "allowRenewal" = false WHERE "price" = 0;

-- 仅恢复当前订阅套餐的一次历史购买记录；被升配覆盖的更早套餐无法从现有数据可靠还原。
INSERT INTO "PlanPurchase" ("id", "identityId", "planId", "sequence", "source", "subscriptionId", "purchasedAt")
SELECT lower(hex(randomblob(16))), "userId", "planId", 1, 'MIGRATED', "id", "createdAt"
FROM "Subscription";
