-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Node" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "serverHost" TEXT NOT NULL,
    "reachability" TEXT NOT NULL DEFAULT 'PUBLIC',
    "isLocal" BOOLEAN NOT NULL DEFAULT false,
    "configOverride" TEXT,
    "singboxLogMode" TEXT NOT NULL DEFAULT 'NORMAL',
    "singboxLogModeUntil" DATETIME,
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
INSERT INTO "new_Node" ("agentProtocolVersion", "agentToken", "agentTokenHash", "agentVersion", "bandwidthRate", "capabilitiesJson", "communicationMode", "configError", "configOverride", "cpuUsage", "createdAt", "currentAgentAssetId", "currentSingboxAssetId", "downloadRate", "id", "isLocal", "kernelRunning", "kernelVersion", "lastProbeResult", "lastSeenAt", "memoryUsage", "name", "osArch", "pollIntervalSecs", "reachability", "serverHost", "status", "updatedAt", "uploadRate") SELECT "agentProtocolVersion", "agentToken", "agentTokenHash", "agentVersion", "bandwidthRate", "capabilitiesJson", "communicationMode", "configError", "configOverride", "cpuUsage", "createdAt", "currentAgentAssetId", "currentSingboxAssetId", "downloadRate", "id", "isLocal", "kernelRunning", "kernelVersion", "lastProbeResult", "lastSeenAt", "memoryUsage", "name", "osArch", "pollIntervalSecs", "reachability", "serverHost", "status", "updatedAt", "uploadRate" FROM "Node";
DROP TABLE "Node";
ALTER TABLE "new_Node" RENAME TO "Node";
CREATE UNIQUE INDEX "Node_agentToken_key" ON "Node"("agentToken");
CREATE UNIQUE INDEX "Node_agentTokenHash_key" ON "Node"("agentTokenHash");
CREATE INDEX "Node_status_idx" ON "Node"("status");
CREATE INDEX "Node_isLocal_idx" ON "Node"("isLocal");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
