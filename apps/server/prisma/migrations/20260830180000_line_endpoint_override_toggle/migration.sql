-- Add an explicit switch while retaining the raw override values.
ALTER TABLE "Line" ADD COLUMN "endpointOverrideEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Existing lines with configured overrides keep their previous effective behavior.
UPDATE "Line"
SET "endpointOverrideEnabled" = true
WHERE "serverHost" IS NOT NULL
   OR "serverPort" IS NOT NULL
   OR "serverName" IS NOT NULL
   OR "host" IS NOT NULL;
