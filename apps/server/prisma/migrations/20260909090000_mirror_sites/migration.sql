-- 实时节点镜像站与 Agent 能力
ALTER TABLE "Node" ADD COLUMN "capabilitiesJson" TEXT NOT NULL DEFAULT '[]';

CREATE TABLE "MirrorSite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "upstreamBaseUrl" TEXT NOT NULL,
    "allowedOriginsJson" TEXT NOT NULL DEFAULT '[]',
    "nodeId" TEXT NOT NULL,
    "accessMode" TEXT NOT NULL DEFAULT 'ADMIN',
    "shareTokenHash" TEXT,
    "shareExpiresAt" DATETIME,
    "shareRotatedAt" DATETIME,
    "lastRequestAt" DATETIME,
    "lastStatusCode" INTEGER,
    "lastErrorCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MirrorSite_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MirrorSite_slug_key" ON "MirrorSite"("slug");
CREATE UNIQUE INDEX "MirrorSite_shareTokenHash_key" ON "MirrorSite"("shareTokenHash");
CREATE INDEX "MirrorSite_nodeId_idx" ON "MirrorSite"("nodeId");
CREATE INDEX "MirrorSite_enabled_createdAt_idx" ON "MirrorSite"("enabled", "createdAt");
CREATE INDEX "MirrorSite_accessMode_enabled_idx" ON "MirrorSite"("accessMode", "enabled");
