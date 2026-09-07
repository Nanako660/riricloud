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
: "${RIRICLOUD_ENV:=production}"
: "${RIRICLOUD_BINARY_DIR:=$PWD/binaries}"

export DATABASE_URL PORT AUTO_SEED RIRICLOUD_ENV RIRICLOUD_BINARY_DIR

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

if [ "$AUTO_SEED" = true ] && { [ "${NODE_ENV:-}" = production ] || [ "$RIRICLOUD_ENV" = production ]; }; then
  echo "生产环境禁止 AUTO_SEED=true，请使用显式 ADMIN_EMAIL/ADMIN_PASSWORD 初始化管理员" >&2
  exit 1
fi

DATABASE_PATH="$(node -e "const value = process.argv[1].replace(/^file:/, '').split('?')[0]; console.log(value.startsWith('/') ? value : 'prisma/' + value);" "$DATABASE_URL")"
mkdir -p "$(dirname "$DATABASE_PATH")"

# 首启生成 Prisma client（目标平台引擎）并应用迁移
node node_modules/prisma/build/index.js generate
node node_modules/prisma/build/index.js migrate deploy
node prisma/bootstrap-admin.js

if [ "$AUTO_SEED" = true ]; then
  echo "seeding demo data (AUTO_SEED=true) ..."
  node prisma/seed.js
fi

MASTER_ENTRY="dist/main.js"
if [ ! -f "$MASTER_ENTRY" ] && [ -f "dist/src/main.js" ]; then
  MASTER_ENTRY="dist/src/main.js"
fi

echo "starting riri-master on port ${PORT} ..."
exec node "$MASTER_ENTRY"
