-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TrafficLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lineId" TEXT,
    "upload" BIGINT NOT NULL DEFAULT 0,
    "download" BIGINT NOT NULL DEFAULT 0,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrafficLog_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrafficLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrafficLog_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "Line" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TrafficLog" ("download", "id", "nodeId", "recordedAt", "upload", "userId") SELECT "download", "id", "nodeId", "recordedAt", "upload", "userId" FROM "TrafficLog";
DROP TABLE "TrafficLog";
ALTER TABLE "new_TrafficLog" RENAME TO "TrafficLog";
CREATE INDEX "TrafficLog_nodeId_idx" ON "TrafficLog"("nodeId");
CREATE INDEX "TrafficLog_userId_idx" ON "TrafficLog"("userId");
CREATE INDEX "TrafficLog_lineId_idx" ON "TrafficLog"("lineId");
CREATE INDEX "TrafficLog_recordedAt_idx" ON "TrafficLog"("recordedAt");
CREATE INDEX "TrafficLog_recordedAt_lineId_idx" ON "TrafficLog"("recordedAt", "lineId");
CREATE INDEX "TrafficLog_recordedAt_userId_idx" ON "TrafficLog"("recordedAt", "userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
