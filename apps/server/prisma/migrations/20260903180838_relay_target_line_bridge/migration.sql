-- DropIndex
DROP INDEX "Node_currentSingboxAssetId_idx";

-- DropIndex
DROP INDEX "Node_currentAgentAssetId_idx";

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
    "exitNodeId" TEXT NOT NULL,
    "exitPort" INTEGER NOT NULL,
    "targetLineId" TEXT,
    "certificateId" TEXT,
    "endpointOverrideEnabled" BOOLEAN NOT NULL DEFAULT false,
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
    CONSTRAINT "Line_exitNodeId_fkey" FOREIGN KEY ("exitNodeId") REFERENCES "Node" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Line_targetLineId_fkey" FOREIGN KEY ("targetLineId") REFERENCES "Line" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Line_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Line" ("certificateId", "createdAt", "endpointOverrideEnabled", "entryNodeId", "entryPort", "exitNodeId", "exitPort", "host", "id", "isPublic", "level", "listen", "name", "paramsJson", "protocolType", "relayMode", "serverHost", "serverName", "serverPort", "sortOrder", "status", "tag", "tagsJson", "trafficRate", "type", "updatedAt") SELECT "certificateId", "createdAt", "endpointOverrideEnabled", "entryNodeId", "entryPort", "exitNodeId", "exitPort", "host", "id", "isPublic", "level", "listen", "name", "paramsJson", "protocolType", "relayMode", "serverHost", "serverName", "serverPort", "sortOrder", "status", "tag", "tagsJson", "trafficRate", "type", "updatedAt" FROM "Line";
DROP TABLE "Line";
ALTER TABLE "new_Line" RENAME TO "Line";
CREATE INDEX "Line_entryNodeId_idx" ON "Line"("entryNodeId");
CREATE INDEX "Line_exitNodeId_idx" ON "Line"("exitNodeId");
CREATE INDEX "Line_targetLineId_idx" ON "Line"("targetLineId");
CREATE INDEX "Line_certificateId_idx" ON "Line"("certificateId");
CREATE INDEX "Line_protocolType_idx" ON "Line"("protocolType");
CREATE INDEX "Line_type_status_idx" ON "Line"("type", "status");
CREATE INDEX "Line_isPublic_idx" ON "Line"("isPublic");
CREATE INDEX "Line_sortOrder_idx" ON "Line"("sortOrder");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
