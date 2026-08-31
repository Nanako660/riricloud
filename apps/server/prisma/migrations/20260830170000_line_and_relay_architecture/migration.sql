-- CreateTable
CREATE TABLE "Line" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'DIRECT',
    "relayMode" TEXT,
    "entryNodeId" TEXT,
    "entryPort" INTEGER,
    "targetInboundId" TEXT NOT NULL,
    "serverHost" TEXT,
    "serverPort" INTEGER,
    "serverName" TEXT,
    "host" TEXT,
    "trafficRate" REAL NOT NULL DEFAULT 1,
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "level" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Line_entryNodeId_fkey" FOREIGN KEY ("entryNodeId") REFERENCES "Node" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Line_targetInboundId_fkey" FOREIGN KEY ("targetInboundId") REFERENCES "NodeInbound" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Node" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "serverHost" TEXT NOT NULL,
    "isLocal" BOOLEAN NOT NULL DEFAULT false,
    "configOverride" TEXT,
    "agentToken" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "lastSeenAt" DATETIME,
    "cpuUsage" REAL,
    "memoryUsage" REAL,
    "bandwidthRate" REAL,
    "kernelRunning" BOOLEAN,
    "configError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Node" ("agentToken", "bandwidthRate", "configError", "configOverride", "cpuUsage", "createdAt", "id", "kernelRunning", "lastSeenAt", "memoryUsage", "name", "serverHost", "status", "updatedAt") SELECT "agentToken", "bandwidthRate", "configError", "configOverride", "cpuUsage", "createdAt", "id", "kernelRunning", "lastSeenAt", "memoryUsage", "name", "serverHost", "status", "updatedAt" FROM "Node";
DROP TABLE "Node";
ALTER TABLE "new_Node" RENAME TO "Node";
CREATE UNIQUE INDEX "Node_agentToken_key" ON "Node"("agentToken");
CREATE INDEX "Node_status_idx" ON "Node"("status");
CREATE INDEX "Node_isLocal_idx" ON "Node"("isLocal");
CREATE TABLE "new_NodeInbound" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "listen" TEXT NOT NULL DEFAULT '::',
    "port" INTEGER NOT NULL,
    "paramsJson" TEXT NOT NULL DEFAULT '{}',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NodeInbound_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_NodeInbound" ("createdAt", "id", "listen", "nodeId", "paramsJson", "port", "sortOrder", "tag", "type", "updatedAt") SELECT "createdAt", "id", "listen", "nodeId", "paramsJson", "port", "sortOrder", "tag", "type", "updatedAt" FROM "NodeInbound";
DROP TABLE "NodeInbound";
ALTER TABLE "new_NodeInbound" RENAME TO "NodeInbound";
CREATE INDEX "NodeInbound_nodeId_idx" ON "NodeInbound"("nodeId");
CREATE UNIQUE INDEX "NodeInbound_nodeId_tag_key" ON "NodeInbound"("nodeId", "tag");
CREATE TABLE "new_Plan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL DEFAULT 0,
    "durationDays" INTEGER NOT NULL,
    "trafficLimitBytes" BIGINT NOT NULL,
    "lineMatchMode" TEXT NOT NULL DEFAULT 'ALL',
    "lineTagsJson" TEXT NOT NULL DEFAULT '[]',
    "lineIdsJson" TEXT NOT NULL DEFAULT '[]',
    "templateId" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Plan_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SubscriptionTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Plan" ("createdAt", "description", "durationDays", "id", "isPublic", "name", "price", "sortOrder", "templateId", "trafficLimitBytes", "updatedAt") SELECT "createdAt", "description", "durationDays", "id", "isPublic", "name", "price", "sortOrder", "templateId", "trafficLimitBytes", "updatedAt" FROM "Plan";
DROP TABLE "Plan";
ALTER TABLE "new_Plan" RENAME TO "Plan";
CREATE INDEX "Plan_isPublic_idx" ON "Plan"("isPublic");
CREATE INDEX "Plan_sortOrder_idx" ON "Plan"("sortOrder");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Line_entryNodeId_idx" ON "Line"("entryNodeId");
CREATE INDEX "Line_targetInboundId_idx" ON "Line"("targetInboundId");
CREATE INDEX "Line_type_status_idx" ON "Line"("type", "status");
CREATE INDEX "Line_isPublic_idx" ON "Line"("isPublic");
CREATE INDEX "Line_sortOrder_idx" ON "Line"("sortOrder");
