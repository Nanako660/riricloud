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
INSERT INTO "new_Line" ("certificateId", "createdAt", "endpointOverrideEnabled", "entryNodeId", "entryPort", "host", "id", "isPublic", "landingNodeId", "landingPort", "lastLatencyMs", "lastTestMessage", "lastTestStatus", "lastTestedAt", "level", "listen", "name", "paramsJson", "protocolType", "relayMode", "serverHost", "serverName", "serverPort", "sortOrder", "status", "tag", "tagsJson", "targetLineId", "trafficRate", "type", "updatedAt") SELECT "certificateId", "createdAt", "endpointOverrideEnabled", "entryNodeId", "entryPort", "host", "id", "isPublic", "landingNodeId", "landingPort", "lastLatencyMs", "lastTestMessage", "lastTestStatus", "lastTestedAt", "level", "listen", "name", "paramsJson", "protocolType", "relayMode", "serverHost", "serverName", "serverPort", "sortOrder", "status", "tag", "tagsJson", "targetLineId", "trafficRate", "type", "updatedAt" FROM "Line";
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
CREATE TABLE "new_Node" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "serverHost" TEXT NOT NULL,
    "reachability" TEXT NOT NULL DEFAULT 'PUBLIC',
    "isLocal" BOOLEAN NOT NULL DEFAULT false,
    "configOverride" TEXT,
    "agentToken" TEXT NOT NULL,
    "agentTokenHash" TEXT,
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
    "osArch" TEXT,
    "kernelVersion" TEXT,
    "capabilitiesJson" TEXT NOT NULL DEFAULT '[]',
    "currentAgentAssetId" TEXT,
    "currentSingboxAssetId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Node" ("agentProtocolVersion", "agentToken", "agentTokenHash", "agentVersion", "bandwidthRate", "capabilitiesJson", "communicationMode", "configError", "configOverride", "cpuUsage", "createdAt", "currentAgentAssetId", "currentSingboxAssetId", "downloadRate", "id", "isLocal", "kernelRunning", "kernelVersion", "lastProbeResult", "lastSeenAt", "memoryUsage", "name", "osArch", "pollIntervalSecs", "serverHost", "status", "updatedAt", "uploadRate") SELECT "agentProtocolVersion", "agentToken", "agentTokenHash", "agentVersion", "bandwidthRate", "capabilitiesJson", "communicationMode", "configError", "configOverride", "cpuUsage", "createdAt", "currentAgentAssetId", "currentSingboxAssetId", "downloadRate", "id", "isLocal", "kernelRunning", "kernelVersion", "lastProbeResult", "lastSeenAt", "memoryUsage", "name", "osArch", "pollIntervalSecs", "serverHost", "status", "updatedAt", "uploadRate" FROM "Node";
DROP TABLE "Node";
ALTER TABLE "new_Node" RENAME TO "Node";
CREATE UNIQUE INDEX "Node_agentToken_key" ON "Node"("agentToken");
CREATE UNIQUE INDEX "Node_agentTokenHash_key" ON "Node"("agentTokenHash");
CREATE INDEX "Node_status_idx" ON "Node"("status");
CREATE INDEX "Node_isLocal_idx" ON "Node"("isLocal");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
