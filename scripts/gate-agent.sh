#!/usr/bin/env bash
# Go Agent 质量门禁：vet / gofmt / test / build（见 docs/CODE_REVIEW.md §2）
# 本地与 CI 共用本脚本，保证门禁命令单一真相源。
set -euo pipefail

RIRI_ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd)"
if [ -f "$RIRI_ROOT/scripts/dev-env.sh" ]; then
  # shellcheck source=scripts/dev-env.sh
  . "$RIRI_ROOT/scripts/dev-env.sh"
fi
is_windows_shell() {
  case "$(uname -s 2>/dev/null || true)" in
    MINGW*|MSYS*|CYGWIN*) return 0 ;;
    *) return 1 ;;
  esac
}

GO_BIN="${GO_BIN:-go}"
GOFMT_BIN="${GOFMT_BIN:-gofmt}"
if is_windows_shell; then
  if ! command -v "$GO_BIN" >/dev/null 2>&1 && ! command -v go.exe >/dev/null 2>&1 && [ -d "$RIRI_ROOT/.tools/go/bin" ]; then
    export PATH="$RIRI_ROOT/.tools/go/bin:$PATH"
  fi
  if ! command -v "$GO_BIN" >/dev/null 2>&1 && command -v go.exe >/dev/null 2>&1; then
    GO_BIN="go.exe"
    GOFMT_BIN="gofmt.exe"
  fi
  command -v "$GO_BIN" >/dev/null 2>&1 || { echo "缺少 Go 工具链（go 或 go.exe）" >&2; exit 1; }
  command -v "$GOFMT_BIN" >/dev/null 2>&1 || { echo "缺少 gofmt 工具链（gofmt 或 gofmt.exe）" >&2; exit 1; }
else
  case "$GO_BIN:$GOFMT_BIN" in
    *.exe*) echo "Linux/WSL 环境严禁调用 Windows Go 工具链（$GO_BIN / $GOFMT_BIN），请安装原生 Go" >&2; exit 1 ;;
  esac
  command -v "$GO_BIN" >/dev/null 2>&1 || { echo "缺少原生 Go 工具链（Linux/WSL 下严禁回退调用 Windows go.exe）" >&2; exit 1; }
  command -v "$GOFMT_BIN" >/dev/null 2>&1 || { echo "缺少原生 gofmt 工具链（Linux/WSL 下严禁回退调用 Windows gofmt.exe）" >&2; exit 1; }
  if [ "$("$GO_BIN" env GOHOSTOS 2>/dev/null || true)" = "windows" ]; then
    echo "检测到当前 go 指向 Windows 工具链（GOHOSTOS=windows），Linux/WSL 下必须使用原生 Go" >&2
    exit 1
  fi
fi

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
