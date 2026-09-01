-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SubscriptionTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isBuiltin" BOOLEAN NOT NULL DEFAULT false,
    "proxyGroupsJson" TEXT NOT NULL DEFAULT '[]',
    "ruleSetsJson" TEXT NOT NULL DEFAULT '[]',
    "dnsConfigJson" TEXT NOT NULL DEFAULT '{}',
    "customInjectYaml" TEXT,
    "customInjectJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SubscriptionTemplate" ("createdAt", "customInjectJson", "customInjectYaml", "description", "dnsConfigJson", "id", "isDefault", "name", "proxyGroupsJson", "ruleSetsJson", "updatedAt") SELECT "createdAt", "customInjectJson", "customInjectYaml", "description", "dnsConfigJson", "id", "isDefault", "name", "proxyGroupsJson", "ruleSetsJson", "updatedAt" FROM "SubscriptionTemplate";
DROP TABLE "SubscriptionTemplate";
ALTER TABLE "new_SubscriptionTemplate" RENAME TO "SubscriptionTemplate";
CREATE INDEX "SubscriptionTemplate_isDefault_idx" ON "SubscriptionTemplate"("isDefault");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
