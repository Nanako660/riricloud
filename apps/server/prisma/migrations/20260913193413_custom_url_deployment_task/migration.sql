-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BinaryDeploymentTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "assetId" TEXT,
    "previousAssetId" TEXT,
    "releaseId" TEXT,
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
INSERT INTO "new_BinaryDeploymentTask" ("assetId", "attempts", "completedAt", "createdAt", "dispatchedAt", "errorMessage", "id", "kind", "nodeId", "operation", "payloadJson", "previousAssetId", "releaseId", "requestedAt", "requestedById", "status", "updatedAt") SELECT "assetId", "attempts", "completedAt", "createdAt", "dispatchedAt", "errorMessage", "id", "kind", "nodeId", "operation", "payloadJson", "previousAssetId", "releaseId", "requestedAt", "requestedById", "status", "updatedAt" FROM "BinaryDeploymentTask";
DROP TABLE "BinaryDeploymentTask";
ALTER TABLE "new_BinaryDeploymentTask" RENAME TO "BinaryDeploymentTask";
CREATE INDEX "BinaryDeploymentTask_nodeId_status_idx" ON "BinaryDeploymentTask"("nodeId", "status");
CREATE INDEX "BinaryDeploymentTask_assetId_idx" ON "BinaryDeploymentTask"("assetId");
CREATE INDEX "BinaryDeploymentTask_releaseId_idx" ON "BinaryDeploymentTask"("releaseId");
CREATE INDEX "BinaryDeploymentTask_requestedAt_idx" ON "BinaryDeploymentTask"("requestedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
