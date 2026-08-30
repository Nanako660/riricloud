-- CreateTable
CREATE TABLE "NodeInbound" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "listen" TEXT NOT NULL DEFAULT '::',
    "port" INTEGER NOT NULL,
    "paramsJson" TEXT NOT NULL DEFAULT '{}',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NodeInbound_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- DataMigration: 存量节点「一节点一入站」配置迁入 NodeInbound（须在 Node 表重建丢列前执行）
-- v0.2.0 协议锁定 VLESS_REALITY，故 tag 统一落 vless-in；id 用 randomblob 拼 UUID 文本
INSERT INTO "NodeInbound" ("id", "nodeId", "type", "tag", "listen", "port", "paramsJson", "sortOrder", "isPublic", "createdAt", "updatedAt")
SELECT
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))),
    "id",
    "protocol",
    'vless-in',
    '::',
    "serverPort",
    COALESCE("configPayload", '{}'),
    0,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Node";

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
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Node" ("agentToken", "bandwidthRate", "cpuUsage", "createdAt", "id", "isPublic", "lastSeenAt", "memoryUsage", "name", "serverHost", "sortOrder", "status", "updatedAt") SELECT "agentToken", "bandwidthRate", "cpuUsage", "createdAt", "id", "isPublic", "lastSeenAt", "memoryUsage", "name", "serverHost", "sortOrder", "status", "updatedAt" FROM "Node";
DROP TABLE "Node";
ALTER TABLE "new_Node" RENAME TO "Node";
CREATE UNIQUE INDEX "Node_agentToken_key" ON "Node"("agentToken");
CREATE INDEX "Node_status_idx" ON "Node"("status");
CREATE INDEX "Node_isPublic_idx" ON "Node"("isPublic");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "NodeInbound_nodeId_idx" ON "NodeInbound"("nodeId");

-- CreateIndex
CREATE UNIQUE INDEX "NodeInbound_nodeId_tag_key" ON "NodeInbound"("nodeId", "tag");
