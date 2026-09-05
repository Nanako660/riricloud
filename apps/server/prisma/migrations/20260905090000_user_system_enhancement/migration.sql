ALTER TABLE "User" ADD COLUMN "uid" INTEGER;
ALTER TABLE "User" ADD COLUMN "nickname" TEXT;

CREATE UNIQUE INDEX "User_uid_key" ON "User"("uid");

CREATE TABLE "VerificationCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "VerificationCode_email_action_createdAt_idx" ON "VerificationCode"("email", "action", "createdAt");
CREATE INDEX "VerificationCode_expiresAt_idx" ON "VerificationCode"("expiresAt");
