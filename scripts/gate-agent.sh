#!/usr/bin/env bash
# Go Agent 质量门禁：vet / gofmt / test / build（见 docs/CODE_REVIEW.md §2）
# 本地与 CI 共用本脚本，保证门禁命令单一真相源。
set -euo pipefail

RIRI_ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd)"
if [ -f "$RIRI_ROOT/scripts/dev-env.sh" ]; then
  # shellcheck source=scripts/dev-env.sh
  . "$RIRI_ROOT/scripts/dev-env.sh"
fi
cd "$RIRI_ROOT/apps/agent"

go vet ./...
UNFORMATTED="$(gofmt -l .)"
if [ -n "$UNFORMATTED" ]; then
  echo "以下文件未通过 gofmt："
  echo "$UNFORMATTED"
  exit 1
fi
go test ./...

# Windows 本地产物带 .exe 后缀，CI/Linux 产物名 riri-agent
case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN*) BIN="riri-agent.exe" ;;
  *) BIN="riri-agent" ;;
esac
CGO_ENABLED=0 go build -o "$BIN" .
echo "agent 门禁通过"
