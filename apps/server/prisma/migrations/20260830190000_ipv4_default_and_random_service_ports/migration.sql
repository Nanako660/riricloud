-- 默认监听切换为 IPv4 通配地址；保留用户明确配置的其他监听地址。
UPDATE "NodeInbound"
SET "listen" = '0.0.0.0'
WHERE "listen" = '::';
