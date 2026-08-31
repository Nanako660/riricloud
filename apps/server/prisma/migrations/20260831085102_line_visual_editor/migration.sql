-- Add the visual editor fields while Line still has the pre-v0.4 targetInbound shape.
-- The following line-centric migration moves these fields together with the
-- protocol and endpoint ownership from NodeInbound to Line.
ALTER TABLE "Line" ADD COLUMN "tag" TEXT;
ALTER TABLE "Line" ADD COLUMN "listen" TEXT NOT NULL DEFAULT '0.0.0.0';
