-- 1. 移除独立的二进制资源审计表（已并入 SystemLog）
DROP TABLE IF EXISTS "BinaryAuditLog";

-- 2. 重建 BinaryAsset 与 BinaryDeploymentTask 外键，解除删除资源时的 RESTRICT 拦截，并清理遗留 SINGBOX 资源
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_BinaryRelease" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL DEFAULT 'AGENT',
    "upstreamVersion" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL DEFAULT 'UPLOAD',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "builtFromAppVersion" TEXT,
    "compatibilityJson" TEXT NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_BinaryRelease" ("id", "kind", "upstreamVersion", "revision", "source", "status", "builtFromAppVersion", "compatibilityJson", "notes", "isDefault", "createdAt", "updatedAt")
SELECT "id", "kind", "upstreamVersion", "revision", "source", "status", "builtFromAppVersion", "compatibilityJson", "notes", "isDefault", "createdAt", "updatedAt"
FROM "BinaryRelease"
WHERE "kind" = 'AGENT';
DROP TABLE "BinaryRelease";
ALTER TABLE "new_BinaryRelease" RENAME TO "BinaryRelease";
CREATE UNIQUE INDEX "BinaryRelease_kind_upstreamVersion_revision_key" ON "BinaryRelease"("kind", "upstreamVersion", "revision");
CREATE INDEX "BinaryRelease_kind_status_idx" ON "BinaryRelease"("kind", "status");
CREATE INDEX "BinaryRelease_isDefault_idx" ON "BinaryRelease"("isDefault");

CREATE TABLE "new_BinaryAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "releaseId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "os" TEXT NOT NULL,
    "arch" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storageRoot" TEXT NOT NULL DEFAULT 'RUNTIME',
    "storagePath" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BinaryAsset_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "BinaryRelease" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_BinaryAsset" ("id", "releaseId", "target", "os", "arch", "filename", "storageRoot", "storagePath", "sha256", "size", "available", "createdAt", "updatedAt")
SELECT "id", "releaseId", "target", "os", "arch", "filename", "storageRoot", "storagePath", "sha256", "size", "available", "createdAt", "updatedAt"
FROM "BinaryAsset"
WHERE "releaseId" IN (SELECT "id" FROM "BinaryRelease");
DROP TABLE "BinaryAsset";
ALTER TABLE "new_BinaryAsset" RENAME TO "BinaryAsset";
CREATE UNIQUE INDEX "BinaryAsset_releaseId_target_key" ON "BinaryAsset"("releaseId", "target");
CREATE INDEX "BinaryAsset_target_available_idx" ON "BinaryAsset"("target", "available");

DELETE FROM "BinaryAssetFile" WHERE "assetId" NOT IN (SELECT "id" FROM "BinaryAsset");

CREATE TABLE "new_BinaryDeploymentTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "assetId" TEXT,
    "previousAssetId" TEXT,
    "releaseId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'AGENT',
    "operation" TEXT NOT NULL DEFAULT 'UPGRADE',
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "errorMessage" TEXT,
    "requestedById" TEXT,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BinaryDeploymentTask_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BinaryDeploymentTask_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "BinaryAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BinaryDeploymentTask_previousAssetId_fkey" FOREIGN KEY ("previousAssetId") REFERENCES "BinaryAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BinaryDeploymentTask_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "BinaryRelease" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_BinaryDeploymentTask" ("id", "nodeId", "assetId", "previousAssetId", "releaseId", "kind", "operation", "status", "attempts", "payloadJson", "errorMessage", "requestedById", "requestedAt", "dispatchedAt", "completedAt", "createdAt", "updatedAt")
SELECT
    "id",
    "nodeId",
    CASE WHEN "assetId" IN (SELECT "id" FROM "BinaryAsset") THEN "assetId" ELSE NULL END,
    CASE WHEN "previousAssetId" IN (SELECT "id" FROM "BinaryAsset") THEN "previousAssetId" ELSE NULL END,
    CASE WHEN "releaseId" IN (SELECT "id" FROM "BinaryRelease") THEN "releaseId" ELSE NULL END,
    "kind",
    "operation",
    "status",
    "attempts",
    "payloadJson",
    "errorMessage",
    "requestedById",
    "requestedAt",
    "dispatchedAt",
    "completedAt",
    "createdAt",
    "updatedAt"
FROM "BinaryDeploymentTask";
DROP TABLE "BinaryDeploymentTask";
ALTER TABLE "new_BinaryDeploymentTask" RENAME TO "BinaryDeploymentTask";
CREATE INDEX "BinaryDeploymentTask_nodeId_status_idx" ON "BinaryDeploymentTask"("nodeId", "status");
CREATE INDEX "BinaryDeploymentTask_assetId_idx" ON "BinaryDeploymentTask"("assetId");
CREATE INDEX "BinaryDeploymentTask_releaseId_idx" ON "BinaryDeploymentTask"("releaseId");
CREATE INDEX "BinaryDeploymentTask_requestedAt_idx" ON "BinaryDeploymentTask"("requestedAt");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
