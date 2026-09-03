-- CreateTable
CREATE TABLE "TrafficCursor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "credential" TEXT NOT NULL,
    "uploadTotal" BIGINT NOT NULL DEFAULT 0,
    "downloadTotal" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TrafficCursor_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TrafficCursor_nodeId_credential_key" ON "TrafficCursor"("nodeId", "credential");
CREATE INDEX "TrafficCursor_nodeId_updatedAt_idx" ON "TrafficCursor"("nodeId", "updatedAt");
