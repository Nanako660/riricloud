-- CreateTable
CREATE TABLE "TrafficHourlyMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bucketStart" DATETIME NOT NULL,
    "nodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL DEFAULT '',
    "proxyKeyId" TEXT NOT NULL DEFAULT '',
    "upload" BIGINT NOT NULL DEFAULT 0,
    "download" BIGINT NOT NULL DEFAULT 0,
    "billedBytes" BIGINT NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "NodeRateMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "bucketStart" DATETIME NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "uploadRateSum" REAL NOT NULL DEFAULT 0,
    "downloadRateSum" REAL NOT NULL DEFAULT 0,
    "uploadRatePeak" REAL NOT NULL DEFAULT 0,
    "downloadRatePeak" REAL NOT NULL DEFAULT 0
);

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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "TrafficHourlyMetric_bucketStart_idx" ON "TrafficHourlyMetric"("bucketStart");

-- CreateIndex
CREATE INDEX "TrafficHourlyMetric_userId_bucketStart_idx" ON "TrafficHourlyMetric"("userId", "bucketStart");

-- CreateIndex
CREATE INDEX "TrafficHourlyMetric_lineId_bucketStart_idx" ON "TrafficHourlyMetric"("lineId", "bucketStart");

-- CreateIndex
CREATE INDEX "TrafficHourlyMetric_nodeId_bucketStart_idx" ON "TrafficHourlyMetric"("nodeId", "bucketStart");

-- CreateIndex
CREATE UNIQUE INDEX "TrafficHourlyMetric_bucketStart_nodeId_userId_lineId_proxyKeyId_key" ON "TrafficHourlyMetric"("bucketStart", "nodeId", "userId", "lineId", "proxyKeyId");

-- CreateIndex
CREATE INDEX "NodeRateMetric_nodeId_bucketStart_idx" ON "NodeRateMetric"("nodeId", "bucketStart");

-- CreateIndex
CREATE INDEX "NodeRateMetric_bucketStart_idx" ON "NodeRateMetric"("bucketStart");

-- CreateIndex
CREATE UNIQUE INDEX "NodeRateMetric_nodeId_bucketStart_key" ON "NodeRateMetric"("nodeId", "bucketStart");

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
