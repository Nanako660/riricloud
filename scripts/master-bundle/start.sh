#!/usr/bin/env bash
# RiriCloud 主控端启动脚本：首次启动自动生成 Prisma client 并执行数据库迁移
# 前置要求：Node.js >= 20；.env 中必须配置 JWT_SECRET
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "缺少 .env：请先 cp .env.example .env 并填写 JWT_SECRET 等配置" >&2
  exit 1
fi

# shellcheck source=/dev/null
. ./.env

if [ -z "${JWT_SECRET:-}" ]; then
  echo "JWT_SECRET 未配置：生产环境必须提供强随机密钥（见 .env.example 注释）" >&2
  exit 1
fi

mkdir -p "$(dirname "$(node -e "console.log('${DATABASE_URL}'.replace(/^file:/,''))" 2>/dev/null || echo data)")" 2>/dev/null || mkdir -p data

# 首启生成 Prisma client（目标平台引擎）并应用迁移
node node_modules/prisma/build/index.js generate
node node_modules/prisma/build/index.js migrate deploy

echo "starting riri-master on port ${PORT:-8080} ..."
exec node dist/main.js
