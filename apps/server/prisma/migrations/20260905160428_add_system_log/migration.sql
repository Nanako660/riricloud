-- CreateTable
CREATE TABLE "SystemLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "traceId" TEXT,
    "source" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "nodeId" TEXT,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SystemLog_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SystemLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SystemLog_createdAt_idx" ON "SystemLog"("createdAt");

-- CreateIndex
CREATE INDEX "SystemLog_source_createdAt_idx" ON "SystemLog"("source", "createdAt");

-- CreateIndex
CREATE INDEX "SystemLog_level_createdAt_idx" ON "SystemLog"("level", "createdAt");

-- CreateIndex
CREATE INDEX "SystemLog_traceId_idx" ON "SystemLog"("traceId");

-- CreateIndex
CREATE INDEX "SystemLog_nodeId_createdAt_idx" ON "SystemLog"("nodeId", "createdAt");

-- CreateIndex
CREATE INDEX "SystemLog_userId_createdAt_idx" ON "SystemLog"("userId", "createdAt");
