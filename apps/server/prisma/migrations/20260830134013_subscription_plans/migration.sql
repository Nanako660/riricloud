-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL DEFAULT 0,
    "durationDays" INTEGER NOT NULL,
    "trafficLimitBytes" BIGINT NOT NULL,
    "nodeMatchMode" TEXT NOT NULL DEFAULT 'ALL',
    "nodeTagsJson" TEXT NOT NULL DEFAULT '[]',
    "nodeIdsJson" TEXT NOT NULL DEFAULT '[]',
    "templateId" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Plan_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SubscriptionTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SubscriptionTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "proxyGroupsJson" TEXT NOT NULL DEFAULT '[]',
    "ruleSetsJson" TEXT NOT NULL DEFAULT '[]',
    "dnsConfigJson" TEXT NOT NULL DEFAULT '{}',
    "customInjectYaml" TEXT,
    "customInjectJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "trafficLimitBytes" BIGINT NOT NULL,
    "trafficUsedBytes" BIGINT NOT NULL DEFAULT 0,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expireAt" DATETIME,
    "subscriptionToken" TEXT NOT NULL,
    "canceledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Node" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "serverHost" TEXT NOT NULL,
    "configOverride" TEXT,
    "agentToken" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "lastSeenAt" DATETIME,
    "cpuUsage" REAL,
    "memoryUsage" REAL,
    "bandwidthRate" REAL,
    "kernelRunning" BOOLEAN,
    "configError" TEXT,
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "level" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Node" ("agentToken", "bandwidthRate", "configError", "configOverride", "cpuUsage", "createdAt", "id", "isPublic", "kernelRunning", "lastSeenAt", "memoryUsage", "name", "serverHost", "sortOrder", "status", "updatedAt") SELECT "agentToken", "bandwidthRate", "configError", "configOverride", "cpuUsage", "createdAt", "id", "isPublic", "kernelRunning", "lastSeenAt", "memoryUsage", "name", "serverHost", "sortOrder", "status", "updatedAt" FROM "Node";
DROP TABLE "Node";
ALTER TABLE "new_Node" RENAME TO "Node";
CREATE UNIQUE INDEX "Node_agentToken_key" ON "Node"("agentToken");
CREATE INDEX "Node_status_idx" ON "Node"("status");
CREATE INDEX "Node_isPublic_idx" ON "Node"("isPublic");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Plan_isPublic_idx" ON "Plan"("isPublic");

-- CreateIndex
CREATE INDEX "Plan_sortOrder_idx" ON "Plan"("sortOrder");

-- CreateIndex
CREATE INDEX "SubscriptionTemplate_isDefault_idx" ON "SubscriptionTemplate"("isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_subscriptionToken_key" ON "Subscription"("subscriptionToken");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Subscription_expireAt_idx" ON "Subscription"("expireAt");
