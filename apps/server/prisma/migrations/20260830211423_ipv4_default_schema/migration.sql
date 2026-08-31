-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NodeInbound" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "listen" TEXT NOT NULL DEFAULT '0.0.0.0',
    "port" INTEGER NOT NULL,
    "paramsJson" TEXT NOT NULL DEFAULT '{}',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NodeInbound_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_NodeInbound" ("createdAt", "id", "listen", "nodeId", "paramsJson", "port", "sortOrder", "tag", "type", "updatedAt") SELECT "createdAt", "id", "listen", "nodeId", "paramsJson", "port", "sortOrder", "tag", "type", "updatedAt" FROM "NodeInbound";
DROP TABLE "NodeInbound";
ALTER TABLE "new_NodeInbound" RENAME TO "NodeInbound";
CREATE INDEX "NodeInbound_nodeId_idx" ON "NodeInbound"("nodeId");
CREATE UNIQUE INDEX "NodeInbound_nodeId_tag_key" ON "NodeInbound"("nodeId", "tag");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
