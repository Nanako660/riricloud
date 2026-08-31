-- Agent 双通信模式：保留默认 WS，HTTP 节点使用 15 秒轮询建议周期。
ALTER TABLE "Node" ADD COLUMN "communicationMode" TEXT NOT NULL DEFAULT 'WS';
ALTER TABLE "Node" ADD COLUMN "pollIntervalSecs" INTEGER NOT NULL DEFAULT 15;
