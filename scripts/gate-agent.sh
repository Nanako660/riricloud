#!/usr/bin/env bash
# Go Agent 质量门禁：vet / gofmt / test / build（见 docs/CODE_REVIEW.md §2）
# 本地与 CI 共用本脚本，保证门禁命令单一真相源。
set -euo pipefail

RIRI_ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd)"
if [ -f "$RIRI_ROOT/scripts/dev-env.sh" ]; then
  # shellcheck source=scripts/dev-env.sh
  . "$RIRI_ROOT/scripts/dev-env.sh"
fi
GO_BIN="go"
GOFMT_BIN="gofmt"
if ! command -v "$GO_BIN" >/dev/null 2>&1 && command -v go.exe >/dev/null 2>&1; then
  # WSL 可复用仓库内缓存的 Windows 便携 Go 工具链。
  GO_BIN="go.exe"
  GOFMT_BIN="gofmt.exe"
fi

command -v "$GO_BIN" >/dev/null 2>&1 || { echo "缺少 Go 工具链（go 或 go.exe）" >&2; exit 1; }
command -v "$GOFMT_BIN" >/dev/null 2>&1 || { echo "缺少 gofmt 工具链（gofmt 或 gofmt.exe）" >&2; exit 1; }

cd "$RIRI_ROOT/apps/agent"
"$GO_BIN" vet ./...
UNFORMATTED="$("$GOFMT_BIN" -l .)"
if [ -n "$UNFORMATTED" ]; then
  echo "以下文件未通过 gofmt："
  echo "$UNFORMATTED"
  exit 1
fi
"$GO_BIN" test ./...

cd "$RIRI_ROOT"
bash "$RIRI_ROOT/scripts/build-agent.sh"
echo "agent 门禁通过"
