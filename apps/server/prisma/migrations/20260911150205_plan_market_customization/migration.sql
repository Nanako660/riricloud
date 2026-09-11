-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Plan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL DEFAULT 0,
    "durationDays" INTEGER NOT NULL,
    "trafficLimitBytes" BIGINT NOT NULL,
    "trafficResetMode" TEXT NOT NULL DEFAULT 'NONE',
    "lineMatchMode" TEXT NOT NULL DEFAULT 'ALL',
    "lineTagsJson" TEXT NOT NULL DEFAULT '[]',
    "lineIdsJson" TEXT NOT NULL DEFAULT '[]',
    "templateId" TEXT,
    "badgeText" TEXT,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "featuresJson" TEXT NOT NULL DEFAULT '[]',
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Plan_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SubscriptionTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Plan" ("createdAt", "description", "durationDays", "id", "isPublic", "lineIdsJson", "lineMatchMode", "lineTagsJson", "name", "price", "sortOrder", "templateId", "trafficLimitBytes", "trafficResetMode", "updatedAt") SELECT "createdAt", "description", "durationDays", "id", "isPublic", "lineIdsJson", "lineMatchMode", "lineTagsJson", "name", "price", "sortOrder", "templateId", "trafficLimitBytes", "trafficResetMode", "updatedAt" FROM "Plan";
DROP TABLE "Plan";
ALTER TABLE "new_Plan" RENAME TO "Plan";
CREATE INDEX "Plan_isPublic_idx" ON "Plan"("isPublic");
CREATE INDEX "Plan_sortOrder_idx" ON "Plan"("sortOrder");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
