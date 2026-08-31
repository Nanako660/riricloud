#!/usr/bin/env bash
# RiriCloud 主控端启动脚本：首次启动自动迁移数据库、初始化 Master-Local，并启动内置 Agent
# 前置要求：Node.js >= 20；.env 中必须配置 JWT_SECRET、ADMIN_EMAIL、ADMIN_PASSWORD
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "缺少 .env：请先 cp .env.example .env 并填写 JWT_SECRET 等配置" >&2
  exit 1
fi

# shellcheck source=/dev/null
set -a
. ./.env
set +a

: "${DATABASE_URL:=file:./data/riri.db}"
: "${PORT:=8080}"
: "${AUTO_SEED:=false}"
: "${MASTER_AGENT_ENABLED:=true}"
: "${RIRICLOUD_BINARY_DIR:=$PWD/binaries}"
: "${MASTER_AGENT_BINARY_PATH:=$RIRICLOUD_BINARY_DIR/agent-linux-amd64}"
: "${SINGBOX_BINARY_PATH:=$RIRICLOUD_BINARY_DIR/singbox-linux-amd64}"

export DATABASE_URL PORT AUTO_SEED MASTER_AGENT_ENABLED

if ! node -e "require('./prisma/admin-bootstrap').validateJwtSecret(process.env.JWT_SECRET)"; then
  echo "JWT_SECRET 无效：必须提供至少 32 位的随机密钥（见 .env.example）" >&2
  exit 1
fi

case "${AUTO_SEED:-false}" in
  true|TRUE|1|yes|YES|on|ON) AUTO_SEED=true ;;
  false|FALSE|0|no|NO|off|OFF) AUTO_SEED=false ;;
  *)
    echo "AUTO_SEED 必须为 true 或 false" >&2
    exit 1
    ;;
esac

case "${MASTER_AGENT_ENABLED:-true}" in
  true|TRUE|1|yes|YES|on|ON) MASTER_AGENT_ENABLED=true ;;
  false|FALSE|0|no|NO|off|OFF) MASTER_AGENT_ENABLED=false ;;
  *)
    echo "MASTER_AGENT_ENABLED 必须为 true 或 false" >&2
    exit 1
    ;;
esac

DATABASE_PATH="$(node -e "const value = process.argv[1].replace(/^file:/, '').split('?')[0]; console.log(value.startsWith('/') ? value : 'prisma/' + value);" "$DATABASE_URL")"
mkdir -p "$(dirname "$DATABASE_PATH")"
MASTER_AGENT_CONFIG_PATH="${MASTER_AGENT_CONFIG_PATH:-$(dirname "$DATABASE_PATH")/master-agent/config.json}"
export MASTER_AGENT_CONFIG_PATH

# 首启生成 Prisma client（目标平台引擎）并应用迁移
node node_modules/prisma/build/index.js generate
node node_modules/prisma/build/index.js migrate deploy
node prisma/bootstrap-admin.js

if [ "$AUTO_SEED" = true ]; then
  echo "seeding demo data (AUTO_SEED=true) ..."
  node prisma/seed.js
fi

if [ "$MASTER_AGENT_ENABLED" != true ]; then
  echo "starting riri-master on port ${PORT} (embedded Agent disabled) ..."
  exec node dist/main.js
fi

[ -x "$MASTER_AGENT_BINARY_PATH" ] || { echo "缺少内置 Agent：$MASTER_AGENT_BINARY_PATH" >&2; exit 1; }
[ -x "$SINGBOX_BINARY_PATH" ] || { echo "缺少内置 sing-box：$SINGBOX_BINARY_PATH" >&2; exit 1; }

MASTER_AGENT_MASTER_URL="${MASTER_AGENT_MASTER_URL:-ws://127.0.0.1:${PORT}/ws/agent}"
case "$MASTER_AGENT_MASTER_URL" in
  ws://*|wss://*) ;;
  *) echo "MASTER_AGENT_MASTER_URL 必须使用 ws:// 或 wss://" >&2; exit 1 ;;
esac
AGENT_TOKEN="$(node prisma/master-agent-config.js --token)"
export MASTER_AGENT_MASTER_URL AGENT_TOKEN MASTER_URL AGENT_MODE SINGBOX_CONFIG_PATH SINGBOX_BINARY_PATH
MASTER_URL="$MASTER_AGENT_MASTER_URL"
AGENT_MODE=ws
SINGBOX_CONFIG_PATH="$MASTER_AGENT_CONFIG_PATH"
mkdir -p "$(dirname "$MASTER_AGENT_CONFIG_PATH")"

echo "starting riri-master on port ${PORT} with embedded Agent ..."
node dist/main.js &
MASTER_PID=$!
AGENT_PID=

stop_children() {
  [ -n "${AGENT_PID:-}" ] && kill "$AGENT_PID" 2>/dev/null || true
  [ -n "${MASTER_PID:-}" ] && kill "$MASTER_PID" 2>/dev/null || true
}

trap stop_children EXIT
trap 'exit 0' INT TERM

node - "$PORT" "$MASTER_PID" <<'NODE'
const port = process.argv[2];
const masterPid = Number(process.argv[3]);
const deadline = Date.now() + 60000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  while (Date.now() < deadline) {
    try {
      process.kill(masterPid, 0);
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/system/version`);
      if (response.ok) process.exit(0);
    } catch {
      // Master 尚未监听，继续等待；进程退出时下一轮会立即失败。
    }
    await sleep(500);
  }
  console.error('等待 Master 就绪超时');
  process.exit(1);
})();
NODE

"$MASTER_AGENT_BINARY_PATH" &
AGENT_PID=$!

set +e
wait -n "$MASTER_PID" "$AGENT_PID"
STATUS=$?
set -e
stop_children
wait "$MASTER_PID" 2>/dev/null || true
wait "$AGENT_PID" 2>/dev/null || true
[ "$STATUS" -eq 0 ] && STATUS=1
exit "$STATUS"
