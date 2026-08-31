-- Line-Centric Pipeline: move protocol and endpoint ownership from NodeInbound to Line.
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
    CONSTRAINT "Line_exitNodeId_fkey" FOREIGN KEY ("exitNodeId") REFERENCES "Node" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Existing lines are converted from their target inbound. The old inbound table is
-- intentionally retained so rollback and operators can inspect pre-v0.4 data.
INSERT INTO "new_Line" (
    "id", "name", "tag", "listen", "type", "relayMode", "protocolType", "paramsJson",
    "entryNodeId", "entryPort", "exitNodeId", "exitPort",
    "endpointOverrideEnabled", "serverHost", "serverPort", "serverName", "host",
    "trafficRate", "tagsJson", "level", "sortOrder", "isPublic", "status", "createdAt", "updatedAt"
)
SELECT
    l."id",
    l."name",
    COALESCE(l."tag", i."tag", 'line-' || substr(l."id", 1, 8)),
    COALESCE(i."listen", '0.0.0.0'),
    l."type",
    l."relayMode",
    CASE WHEN i."type" = 'VLESS_REALITY' THEN 'VLESS' ELSE i."type" END,
    i."paramsJson",
    COALESCE(l."entryNodeId", i."nodeId"),
    COALESCE(l."entryPort", i."port"),
    i."nodeId",
    i."port",
    l."endpointOverrideEnabled",
    l."serverHost",
    l."serverPort",
    l."serverName",
    l."host",
    l."trafficRate",
    l."tagsJson",
    l."level",
    l."sortOrder",
    l."isPublic",
    l."status",
    l."createdAt",
    l."updatedAt"
FROM "Line" l
JOIN "NodeInbound" i ON i."id" = l."targetInboundId";

DROP TABLE "Line";
ALTER TABLE "new_Line" RENAME TO "Line";

CREATE INDEX "Line_entryNodeId_idx" ON "Line"("entryNodeId");
CREATE INDEX "Line_exitNodeId_idx" ON "Line"("exitNodeId");
CREATE INDEX "Line_protocolType_idx" ON "Line"("protocolType");
CREATE INDEX "Line_type_status_idx" ON "Line"("type", "status");
CREATE INDEX "Line_isPublic_idx" ON "Line"("isPublic");
CREATE INDEX "Line_sortOrder_idx" ON "Line"("sortOrder");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
