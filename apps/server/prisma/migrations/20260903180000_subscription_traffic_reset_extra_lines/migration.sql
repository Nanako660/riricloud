-- 订阅流量周期重置与用户额外线路授权
ALTER TABLE "Plan" ADD COLUMN "trafficResetMode" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "Subscription" ADD COLUMN "trafficPeriodStartAt" DATETIME;

CREATE INDEX "Subscription_trafficPeriodStartAt_idx" ON "Subscription"("trafficPeriodStartAt");

CREATE TABLE "UserLineGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserLineGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserLineGrant_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "Line" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "UserLineGrant_userId_lineId_key" ON "UserLineGrant"("userId", "lineId");
CREATE INDEX "UserLineGrant_userId_idx" ON "UserLineGrant"("userId");
CREATE INDEX "UserLineGrant_lineId_idx" ON "UserLineGrant"("lineId");
