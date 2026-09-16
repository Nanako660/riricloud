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
