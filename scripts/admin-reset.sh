#!/usr/bin/env bash
# 重置源码工作区中已有 ADMIN 账号的密码。
set -euo pipefail

RIRI_ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="${RIRICLOUD_ENV_FILE:-}"
if [ -z "$ENV_FILE" ] && [ -f "$RIRI_ROOT/apps/server/.env" ]; then
  ENV_FILE="$RIRI_ROOT/apps/server/.env"
fi
if [ -z "$ENV_FILE" ] && [ -f "$RIRI_ROOT/.env" ]; then
  ENV_FILE="$RIRI_ROOT/.env"
fi

if [ -n "$ENV_FILE" ]; then
  # shellcheck source=/dev/null
  set -a
  . "$ENV_FILE"
  set +a
fi

cd "$RIRI_ROOT/apps/server"
exec node prisma/admin-reset.js "$@"
