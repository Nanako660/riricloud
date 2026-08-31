-- 节点详情运维画像与最近探针快照
ALTER TABLE "Node" ADD COLUMN "lastProbeResult" TEXT;
ALTER TABLE "Node" ADD COLUMN "agentVersion" TEXT;
ALTER TABLE "Node" ADD COLUMN "osArch" TEXT;
ALTER TABLE "Node" ADD COLUMN "kernelVersion" TEXT;
