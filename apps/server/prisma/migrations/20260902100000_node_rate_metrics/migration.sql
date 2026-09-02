-- CreateTable
CREATE TABLE "NodeRateMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "bucketStart" DATETIME NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "uploadRateSum" REAL NOT NULL DEFAULT 0,
    "downloadRateSum" REAL NOT NULL DEFAULT 0,
    "uploadRatePeak" REAL NOT NULL DEFAULT 0,
    "downloadRatePeak" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "NodeRateMetric_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable
ALTER TABLE "Node" ADD COLUMN "uploadRate" REAL;
ALTER TABLE "Node" ADD COLUMN "downloadRate" REAL;

-- CreateIndex
CREATE UNIQUE INDEX "NodeRateMetric_nodeId_bucketStart_key" ON "NodeRateMetric"("nodeId", "bucketStart");
CREATE INDEX "NodeRateMetric_nodeId_bucketStart_idx" ON "NodeRateMetric"("nodeId", "bucketStart");
CREATE INDEX "NodeRateMetric_bucketStart_idx" ON "NodeRateMetric"("bucketStart");
