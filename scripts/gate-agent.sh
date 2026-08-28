#!/usr/bin/env bash
# Go Agent 质量门禁：vet / gofmt / test / build（见 docs/CODE_REVIEW.md §2）
set -euo pipefail
source "$(dirname "$0")/dev-env.sh"
cd "$RIRI_ROOT/apps/agent"

go vet ./...
UNFORMATTED="$(gofmt -l .)"
if [ -n "$UNFORMATTED" ]; then
  echo "以下文件未通过 gofmt："
  echo "$UNFORMATTED"
  exit 1
fi
go test ./...
go build -o riri-agent.exe .
echo "agent 门禁通过"
