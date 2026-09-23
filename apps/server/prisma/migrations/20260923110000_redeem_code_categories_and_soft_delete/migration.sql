-- 卡密分类、购买身份额度占用、套餐奖励快照及软删除。
CREATE TABLE "RedeemCodeCategory" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "tagsJson" TEXT NOT NULL DEFAULT '[]',
  "rewardType" TEXT NOT NULL DEFAULT 'BALANCE',
  "rewardAmount" INTEGER,
  "planId" TEXT REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "limitPerIdentity" INTEGER DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "RedeemCodeCategory_name_key" ON "RedeemCodeCategory"("name");
CREATE INDEX "RedeemCodeCategory_isActive_idx" ON "RedeemCodeCategory"("isActive");

INSERT INTO "RedeemCodeCategory" ("id", "name", "tagsJson", "rewardType", "limitPerIdentity", "isActive", "updatedAt")
VALUES ('legacy-redeem-code-category', '历史卡密', '[]', 'BALANCE', NULL, false, CURRENT_TIMESTAMP);

CREATE TABLE "RedeemCodeCategoryUsage" (
  "identityId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" DATETIME NOT NULL,
  PRIMARY KEY ("identityId", "categoryId"),
  CONSTRAINT "RedeemCodeCategoryUsage_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "PlanPurchaseIdentity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RedeemCodeCategoryUsage_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "RedeemCodeCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "RedeemCodeCategoryUsage_categoryId_idx" ON "RedeemCodeCategoryUsage"("categoryId");

ALTER TABLE "RedeemCode" ADD COLUMN "categoryId" TEXT REFERENCES "RedeemCodeCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RedeemCode" ADD COLUMN "rewardType" TEXT NOT NULL DEFAULT 'BALANCE';
ALTER TABLE "RedeemCode" ADD COLUMN "rewardSnapshotJson" TEXT;
ALTER TABLE "RedeemCode" ADD COLUMN "planId" TEXT;
ALTER TABLE "RedeemCode" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "RedeemCode" ADD COLUMN "deletedByUserId" TEXT;
UPDATE "RedeemCode" SET "categoryId" = 'legacy-redeem-code-category', "rewardSnapshotJson" = '{"type":"BALANCE","amount":' || "amount" || '}';
CREATE INDEX "RedeemCode_categoryId_status_idx" ON "RedeemCode"("categoryId", "status");
CREATE INDEX "RedeemCode_deletedAt_idx" ON "RedeemCode"("deletedAt");
CREATE INDEX "RedeemCode_planId_status_idx" ON "RedeemCode"("planId", "status");

ALTER TABLE "Subscription" ADD COLUMN "planSnapshotJson" TEXT;

