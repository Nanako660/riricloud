-- AlterTable
ALTER TABLE "Line" ADD COLUMN "lastLatencyMs" INTEGER;
ALTER TABLE "Line" ADD COLUMN "lastTestedAt" DATETIME;
ALTER TABLE "Line" ADD COLUMN "lastTestStatus" TEXT;
ALTER TABLE "Line" ADD COLUMN "lastTestMessage" TEXT;
