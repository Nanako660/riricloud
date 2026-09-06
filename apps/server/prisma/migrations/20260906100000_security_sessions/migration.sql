ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Node" ADD COLUMN "agentTokenHash" TEXT;
CREATE UNIQUE INDEX "Node_agentTokenHash_key" ON "Node"("agentTokenHash");
