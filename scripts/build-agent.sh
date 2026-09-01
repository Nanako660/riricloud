#!/usr/bin/env bash
# 构建当前平台 Agent，并把本地二进制统一输出到 artifacts/dev/agent。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ -f "$ROOT/scripts/dev-env.sh" ]; then
  # shellcheck source=scripts/dev-env.sh
  . "$ROOT/scripts/dev-env.sh"
fi

GO_BIN="${GO_BIN:-go}"
if ! command -v "$GO_BIN" >/dev/null 2>&1 && command -v go.exe >/dev/null 2>&1; then
  GO_BIN="go.exe"
fi
command -v "$GO_BIN" >/dev/null 2>&1 || { echo "缺少 Go 工具链（go 或 go.exe）" >&2; exit 1; }

NODE_BIN="${NODE_BIN:-node}"
if ! command -v "$NODE_BIN" >/dev/null 2>&1 && command -v node.exe >/dev/null 2>&1; then
  NODE_BIN="node.exe"
fi
command -v "$NODE_BIN" >/dev/null 2>&1 || { echo "缺少 Node.js 工具链（node 或 node.exe）" >&2; exit 1; }

GOOS_VALUE="${GOOS:-$($GO_BIN env GOOS)}"
GOARCH_VALUE="${GOARCH:-$($GO_BIN env GOARCH)}"
if [ "$GOOS_VALUE" = "windows" ]; then
  BIN_NAME="riri-agent.exe"
else
  BIN_NAME="riri-agent"
fi

if [ -n "${RIRICLOUD_AGENT_BINARY_PATH:-}" ]; then
  OUTPUT_PATH="$RIRICLOUD_AGENT_BINARY_PATH"
else
  ARTIFACT_ROOT="${RIRICLOUD_ARTIFACT_DIR:-$ROOT/artifacts}"
  OUTPUT_PATH="$ARTIFACT_ROOT/dev/agent/${GOOS_VALUE}-${GOARCH_VALUE}/$BIN_NAME"
fi

OUTPUT_DIR="$(dirname "$OUTPUT_PATH")"
mkdir -p "$OUTPUT_DIR"
# 后续会进入 apps/agent 的嵌套 Go module，先固定输出绝对路径，避免相对目录随 cwd 改变。
OUTPUT_PATH="$(cd "$OUTPUT_DIR" && pwd)/$(basename "$OUTPUT_PATH")"
VERSION="${RIRICLOUD_VERSION:-$($NODE_BIN -p "require('./package.json').version")}"
cd "$ROOT/apps/agent"
# 当前 Go 工具链可能将 main.Version 的默认值折叠，导致 -X 注入失效；仅关闭主包优化以保留可靠注入。
GO_OUTPUT_PATH="$OUTPUT_PATH"
if [ "$GO_BIN" = "go.exe" ]; then
	if command -v wslpath >/dev/null 2>&1; then
		GO_OUTPUT_PATH="$(wslpath -w "$OUTPUT_PATH")"
	elif command -v cygpath >/dev/null 2>&1; then
		GO_OUTPUT_PATH="$(cygpath -w "$OUTPUT_PATH")"
	fi
fi
CGO_ENABLED=0 GOOS="$GOOS_VALUE" GOARCH="$GOARCH_VALUE" \
  "$GO_BIN" build -gcflags "main=-N -l" -trimpath -ldflags "-X main.Version=$VERSION" \
  -o "$GO_OUTPUT_PATH" .

echo "Agent 构建完成：$OUTPUT_PATH"
