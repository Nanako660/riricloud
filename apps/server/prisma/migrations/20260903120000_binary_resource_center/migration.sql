-- 二进制资源中心：逻辑版本、平台资产、部署任务和审计记录
CREATE TABLE "BinaryRelease" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "upstreamVersion" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL DEFAULT 'BUILTIN',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "builtFromAppVersion" TEXT,
    "compatibilityJson" TEXT NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "BinaryRelease_kind_upstreamVersion_revision_key" ON "BinaryRelease"("kind", "upstreamVersion", "revision");
CREATE INDEX "BinaryRelease_kind_status_idx" ON "BinaryRelease"("kind", "status");
CREATE INDEX "BinaryRelease_isDefault_idx" ON "BinaryRelease"("isDefault");

CREATE TABLE "BinaryAsset" (
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
    CONSTRAINT "BinaryAsset_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "BinaryRelease" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BinaryAsset_releaseId_target_key" ON "BinaryAsset"("releaseId", "target");
CREATE INDEX "BinaryAsset_target_available_idx" ON "BinaryAsset"("target", "available");

CREATE TABLE "BinaryAssetFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'main',
    "storageRoot" TEXT NOT NULL DEFAULT 'RUNTIME',
    "storagePath" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mode" INTEGER NOT NULL DEFAULT 493,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BinaryAssetFile_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "BinaryAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BinaryAssetFile_assetId_name_key" ON "BinaryAssetFile"("assetId", "name");
CREATE INDEX "BinaryAssetFile_sha256_idx" ON "BinaryAssetFile"("sha256");

CREATE TABLE "BinaryDeploymentTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "previousAssetId" TEXT,
    "releaseId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
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
    CONSTRAINT "BinaryDeploymentTask_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "BinaryAsset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BinaryDeploymentTask_previousAssetId_fkey" FOREIGN KEY ("previousAssetId") REFERENCES "BinaryAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BinaryDeploymentTask_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "BinaryRelease" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "BinaryDeploymentTask_nodeId_status_idx" ON "BinaryDeploymentTask"("nodeId", "status");
CREATE INDEX "BinaryDeploymentTask_assetId_idx" ON "BinaryDeploymentTask"("assetId");
CREATE INDEX "BinaryDeploymentTask_releaseId_idx" ON "BinaryDeploymentTask"("releaseId");
CREATE INDEX "BinaryDeploymentTask_requestedAt_idx" ON "BinaryDeploymentTask"("requestedAt");

CREATE TABLE "BinaryAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "releaseId" TEXT,
    "assetId" TEXT,
    "taskId" TEXT,
    "nodeId" TEXT,
    "operatorId" TEXT,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BinaryAuditLog_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "BinaryRelease" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BinaryAuditLog_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "BinaryAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BinaryAuditLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "BinaryDeploymentTask" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "BinaryAuditLog_releaseId_createdAt_idx" ON "BinaryAuditLog"("releaseId", "createdAt");
CREATE INDEX "BinaryAuditLog_assetId_createdAt_idx" ON "BinaryAuditLog"("assetId", "createdAt");
CREATE INDEX "BinaryAuditLog_taskId_idx" ON "BinaryAuditLog"("taskId");
CREATE INDEX "BinaryAuditLog_nodeId_createdAt_idx" ON "BinaryAuditLog"("nodeId", "createdAt");

ALTER TABLE "Node" ADD COLUMN "agentProtocolVersion" INTEGER;
ALTER TABLE "Node" ADD COLUMN "currentAgentAssetId" TEXT;
ALTER TABLE "Node" ADD COLUMN "currentSingboxAssetId" TEXT;
CREATE INDEX "Node_currentAgentAssetId_idx" ON "Node"("currentAgentAssetId");
CREATE INDEX "Node_currentSingboxAssetId_idx" ON "Node"("currentSingboxAssetId");
