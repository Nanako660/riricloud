-- CreateTable
CREATE TABLE "ProxyKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "whitelistIps" TEXT NOT NULL DEFAULT '',
    "exportToken" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "trafficUsedBytes" BIGINT NOT NULL DEFAULT 0,
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProxyKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TrafficLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lineId" TEXT,
    "proxyKeyId" TEXT,
    "upload" BIGINT NOT NULL DEFAULT 0,
    "download" BIGINT NOT NULL DEFAULT 0,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrafficLog_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrafficLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrafficLog_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "Line" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TrafficLog_proxyKeyId_fkey" FOREIGN KEY ("proxyKeyId") REFERENCES "ProxyKey" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TrafficLog" ("download", "id", "lineId", "nodeId", "recordedAt", "upload", "userId") SELECT "download", "id", "lineId", "nodeId", "recordedAt", "upload", "userId" FROM "TrafficLog";
DROP TABLE "TrafficLog";
ALTER TABLE "new_TrafficLog" RENAME TO "TrafficLog";
CREATE INDEX "TrafficLog_nodeId_idx" ON "TrafficLog"("nodeId");
CREATE INDEX "TrafficLog_userId_idx" ON "TrafficLog"("userId");
CREATE INDEX "TrafficLog_lineId_idx" ON "TrafficLog"("lineId");
CREATE INDEX "TrafficLog_proxyKeyId_idx" ON "TrafficLog"("proxyKeyId");
CREATE INDEX "TrafficLog_recordedAt_idx" ON "TrafficLog"("recordedAt");
CREATE INDEX "TrafficLog_recordedAt_lineId_idx" ON "TrafficLog"("recordedAt", "lineId");
CREATE INDEX "TrafficLog_recordedAt_userId_idx" ON "TrafficLog"("recordedAt", "userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ProxyKey_username_key" ON "ProxyKey"("username");

-- CreateIndex
CREATE UNIQUE INDEX "ProxyKey_exportToken_key" ON "ProxyKey"("exportToken");

-- CreateIndex
CREATE INDEX "ProxyKey_userId_idx" ON "ProxyKey"("userId");

-- CreateIndex
CREATE INDEX "ProxyKey_isActive_idx" ON "ProxyKey"("isActive");

-- CreateIndex
CREATE INDEX "ProxyKey_userId_isActive_idx" ON "ProxyKey"("userId", "isActive");
