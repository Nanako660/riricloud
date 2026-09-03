-- Add the cent-based wallet balance and immutable balance ledger.
ALTER TABLE "User" ADD COLUMN "balance" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "RedeemCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNUSED',
    "expiresAt" DATETIME,
    "note" TEXT,
    "redeemedAt" DATETIME,
    "redeemedByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RedeemCode_redeemedByUserId_fkey" FOREIGN KEY ("redeemedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "BalanceTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "referenceId" TEXT,
    "redeemCodeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BalanceTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BalanceTransaction_redeemCodeId_fkey" FOREIGN KEY ("redeemCodeId") REFERENCES "RedeemCode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RedeemCode_code_key" ON "RedeemCode"("code");
CREATE INDEX "RedeemCode_status_createdAt_idx" ON "RedeemCode"("status", "createdAt");
CREATE INDEX "RedeemCode_expiresAt_idx" ON "RedeemCode"("expiresAt");
CREATE INDEX "RedeemCode_redeemedByUserId_idx" ON "RedeemCode"("redeemedByUserId");
CREATE UNIQUE INDEX "BalanceTransaction_redeemCodeId_key" ON "BalanceTransaction"("redeemCodeId");
CREATE INDEX "BalanceTransaction_userId_createdAt_idx" ON "BalanceTransaction"("userId", "createdAt");
CREATE INDEX "BalanceTransaction_type_createdAt_idx" ON "BalanceTransaction"("type", "createdAt");
CREATE INDEX "BalanceTransaction_referenceId_idx" ON "BalanceTransaction"("referenceId");

-- Historical prices were previously stored as whole yuan values.
UPDATE "Plan" SET "price" = "price" * 100 WHERE "price" > 0;
