-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Line" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "tag" TEXT,
    "listen" TEXT NOT NULL DEFAULT '0.0.0.0',
    "type" TEXT NOT NULL DEFAULT 'DIRECT',
    "relayMode" TEXT,
    "protocolType" TEXT NOT NULL DEFAULT 'VLESS',
    "paramsJson" TEXT NOT NULL DEFAULT '{}',
    "entryNodeId" TEXT NOT NULL,
    "entryPort" INTEGER NOT NULL,
    "landingNodeId" TEXT,
    "landingPort" INTEGER,
    "targetLineId" TEXT,
    "certificateId" TEXT,
    "endpointOverrideEnabled" BOOLEAN NOT NULL DEFAULT false,
    "serverHost" TEXT,
    "serverPort" INTEGER,
    "serverName" TEXT,
    "host" TEXT,
    "trafficRate" REAL NOT NULL DEFAULT 1,
    "allowLanAccess" BOOLEAN NOT NULL DEFAULT false,
    "tunnelType" TEXT,
    "tunnelPort" INTEGER,
    "tunnelSecret" TEXT,
    "speedLimitMbps" INTEGER DEFAULT 0,
    "tcpFastOpen" BOOLEAN NOT NULL DEFAULT false,
    "tcpMultiPath" BOOLEAN NOT NULL DEFAULT false,
    "udpFragment" BOOLEAN,
    "udpTimeout" TEXT,
    "proxyProtocol" BOOLEAN NOT NULL DEFAULT false,
    "proxyProtocolAcceptNoHeader" BOOLEAN NOT NULL DEFAULT false,
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "level" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastLatencyMs" INTEGER,
    "lastTestedAt" DATETIME,
    "lastTestStatus" TEXT,
    "lastTestMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Line_entryNodeId_fkey" FOREIGN KEY ("entryNodeId") REFERENCES "Node" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Line_landingNodeId_fkey" FOREIGN KEY ("landingNodeId") REFERENCES "Node" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Line_targetLineId_fkey" FOREIGN KEY ("targetLineId") REFERENCES "Line" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Line_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Line" ("allowLanAccess", "certificateId", "createdAt", "endpointOverrideEnabled", "entryNodeId", "entryPort", "host", "id", "isPublic", "landingNodeId", "landingPort", "lastLatencyMs", "lastTestMessage", "lastTestStatus", "lastTestedAt", "level", "listen", "name", "paramsJson", "protocolType", "relayMode", "serverHost", "serverName", "serverPort", "sortOrder", "status", "tag", "tagsJson", "targetLineId", "trafficRate", "tunnelPort", "tunnelSecret", "tunnelType", "type", "updatedAt") SELECT "allowLanAccess", "certificateId", "createdAt", "endpointOverrideEnabled", "entryNodeId", "entryPort", "host", "id", "isPublic", "landingNodeId", "landingPort", "lastLatencyMs", "lastTestMessage", "lastTestStatus", "lastTestedAt", "level", "listen", "name", "paramsJson", "protocolType", "relayMode", "serverHost", "serverName", "serverPort", "sortOrder", "status", "tag", "tagsJson", "targetLineId", "trafficRate", "tunnelPort", "tunnelSecret", "tunnelType", "type", "updatedAt" FROM "Line";
DROP TABLE "Line";
ALTER TABLE "new_Line" RENAME TO "Line";
CREATE INDEX "Line_entryNodeId_idx" ON "Line"("entryNodeId");
CREATE INDEX "Line_landingNodeId_idx" ON "Line"("landingNodeId");
CREATE INDEX "Line_targetLineId_idx" ON "Line"("targetLineId");
CREATE INDEX "Line_certificateId_idx" ON "Line"("certificateId");
CREATE INDEX "Line_protocolType_idx" ON "Line"("protocolType");
CREATE INDEX "Line_type_status_idx" ON "Line"("type", "status");
CREATE INDEX "Line_isPublic_idx" ON "Line"("isPublic");
CREATE INDEX "Line_sortOrder_idx" ON "Line"("sortOrder");
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
    "speedLimitMbps" INTEGER DEFAULT 0,
    "appendSpeedBadge" TEXT NOT NULL DEFAULT 'INHERIT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Plan_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SubscriptionTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Plan" ("allowRenewal", "badgeText", "cardConfigJson", "createdAt", "description", "durationDays", "featuresJson", "id", "isFeatured", "isPublic", "lineIdsJson", "lineMatchMode", "lineTagsJson", "name", "price", "purchaseLimitPerUser", "sortOrder", "templateId", "trafficLimitBytes", "trafficResetMode", "updatedAt") SELECT "allowRenewal", "badgeText", "cardConfigJson", "createdAt", "description", "durationDays", "featuresJson", "id", "isFeatured", "isPublic", "lineIdsJson", "lineMatchMode", "lineTagsJson", "name", "price", "purchaseLimitPerUser", "sortOrder", "templateId", "trafficLimitBytes", "trafficResetMode", "updatedAt" FROM "Plan";
DROP TABLE "Plan";
ALTER TABLE "new_Plan" RENAME TO "Plan";
CREATE INDEX "Plan_isPublic_idx" ON "Plan"("isPublic");
CREATE INDEX "Plan_sortOrder_idx" ON "Plan"("sortOrder");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
