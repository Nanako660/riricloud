#!/usr/bin/env bash
# 重置发行包中已有 ADMIN 账号的密码。
set -euo pipefail

cd "$(dirname "$0")"

if [ -f .env ]; then
  # shellcheck source=/dev/null
  set -a
  . ./.env
  set +a
fi

exec node prisma/admin-reset.js "$@"
