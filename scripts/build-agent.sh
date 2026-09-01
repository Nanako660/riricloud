#!/usr/bin/env bash
# 构建 Agent 二进制：默认构建当前平台，也支持指定目标或完整平台矩阵。
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ -f "$ROOT/scripts/dev-env.sh" ]; then
  # shellcheck source=scripts/dev-env.sh
  . "$ROOT/scripts/dev-env.sh"
fi

die() {
  echo "Agent 构建失败：$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
用法：bash scripts/build-agent.sh [选项]

默认构建当前 Go 平台，输出到 artifacts/dev/agent/<os>-<arch>/。

选项：
  -t, --target <os>/<arch>  指定目标，例如 linux/amd64、windows/amd64
  -o, --output <path>       指定单个输出文件路径
      --all                 构建 linux/amd64、linux/arm64、darwin/amd64、darwin/arm64、windows/amd64
      --version <version>   覆盖根 package.json 中的版本号
      --release              使用发布模式（去符号、去调试信息）
      --debug                使用调试模式（默认，保留当前开发行为）
  -h, --help                 显示帮助

环境变量：
  GO_BIN、GOOS、GOARCH、RIRICLOUD_AGENT_BINARY_PATH、RIRICLOUD_AGENT_BUILD_MODE
EOF
}

resolve_go() {
  GO_BIN="${GO_BIN:-go}"
  if ! command -v "$GO_BIN" >/dev/null 2>&1 && command -v go.exe >/dev/null 2>&1; then
    GO_BIN="go.exe"
  fi
  command -v "$GO_BIN" >/dev/null 2>&1 || die "缺少 Go 工具链（go 或 go.exe）"
}

resolve_node() {
  NODE_BIN="${NODE_BIN:-node}"
  if ! command -v "$NODE_BIN" >/dev/null 2>&1 && command -v node.exe >/dev/null 2>&1; then
    NODE_BIN="node.exe"
  fi
  command -v "$NODE_BIN" >/dev/null 2>&1 || die "缺少 Node.js 工具链（node 或 node.exe）"
}

normalize_target() {
  local raw="$1"
  local target_os
  local target_arch

  if [[ "$raw" == */* ]]; then
    target_os="${raw%%/*}"
    target_arch="${raw#*/}"
  elif [[ "$raw" == *-* ]]; then
    target_os="${raw%-*}"
    target_arch="${raw##*-}"
  else
    die "目标平台必须使用 <os>/<arch> 或 <os>-<arch> 格式：$raw"
  fi

  case "$target_arch" in
    x86_64) target_arch="amd64" ;;
    aarch64) target_arch="arm64" ;;
    armv7) target_arch="arm" ;;
  esac

  [ -n "$target_os" ] || die "目标平台缺少 GOOS：$raw"
  [ -n "$target_arch" ] || die "目标平台缺少 GOARCH：$raw"
  TARGET_OS="$target_os"
  TARGET_ARCH="$target_arch"
}

absolute_output_path() {
  local output_path="$1"
  local output_dir
  output_dir="$(dirname "$output_path")"
  mkdir -p "$output_dir"
  printf '%s/%s\n' "$(cd "$output_dir" && pwd)" "$(basename "$output_path")"
}

build_target() {
  local raw_target="$1"
  local output_path
  local bin_name
  local go_output_path
  local ldflags

  normalize_target "$raw_target"

  if [ "$TARGET_OS" = "windows" ]; then
    bin_name="riri-agent.exe"
  else
    bin_name="riri-agent"
  fi

  if [ -n "$OUTPUT_OVERRIDE" ]; then
    output_path="$OUTPUT_OVERRIDE"
  else
    output_path="$ARTIFACT_ROOT/dev/agent/${TARGET_OS}-${TARGET_ARCH}/$bin_name"
    if [ -n "${RIRICLOUD_AGENT_BINARY_PATH:-}" ]; then
      output_path="$RIRICLOUD_AGENT_BINARY_PATH"
    fi
  fi
  output_path="$(absolute_output_path "$output_path")"

  go_output_path="$output_path"
  case "$GO_BIN" in
    *.exe)
      if command -v wslpath >/dev/null 2>&1; then
        go_output_path="$(wslpath -w "$output_path")"
      elif command -v cygpath >/dev/null 2>&1; then
        go_output_path="$(cygpath -w "$output_path")"
      fi
      ;;
  esac

  if [ "$BUILD_MODE" = "release" ]; then
    ldflags="-s -w -X main.Version=$VERSION"
  else
    ldflags="-X main.Version=$VERSION"
  fi

  echo "构建 Agent：$TARGET_OS/$TARGET_ARCH（$BUILD_MODE）"
  (
    cd "$ROOT/apps/agent"
    local -a args
    if [ "$BUILD_MODE" = "release" ]; then
      args=(build -trimpath -ldflags "$ldflags" -o "$go_output_path" .)
    else
      args=(build -gcflags "main=-N -l" -trimpath -ldflags "$ldflags" -o "$go_output_path" .)
    fi
    # 无论宿主平台如何，Agent 都必须是 CGO 关闭的独立二进制。
    CGO_ENABLED=0 GOOS="$TARGET_OS" GOARCH="$TARGET_ARCH" "$GO_BIN" "${args[@]}"
  )

  echo "Agent 构建完成：$output_path"
}

VERSION="${RIRICLOUD_VERSION:-}"
ARTIFACT_ROOT="${RIRICLOUD_ARTIFACT_DIR:-$ROOT/artifacts}"
BUILD_MODE="${RIRICLOUD_AGENT_BUILD_MODE:-debug}"
OUTPUT_OVERRIDE=""
ALL_TARGETS=0
TARGETS=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    -t|--target)
      [ "$#" -ge 2 ] || die "$1 缺少参数"
      TARGETS+=("$2")
      shift 2
      ;;
    -o|--output)
      [ "$#" -ge 2 ] || die "$1 缺少参数"
      OUTPUT_OVERRIDE="$2"
      shift 2
      ;;
    --version)
      [ "$#" -ge 2 ] || die "$1 缺少参数"
      VERSION="$2"
      shift 2
      ;;
    --release)
      BUILD_MODE="release"
      shift
      ;;
    --debug)
      BUILD_MODE="debug"
      shift
      ;;
    --all)
      ALL_TARGETS=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "未知参数：$1（使用 --help 查看用法）"
      ;;
  esac
done

case "$BUILD_MODE" in
  debug|release) ;;
  *) die "RIRICLOUD_AGENT_BUILD_MODE 必须是 debug 或 release：$BUILD_MODE" ;;
esac

resolve_go
resolve_node

if [ -z "$VERSION" ]; then
  VERSION="$($NODE_BIN -p "require('./package.json').version")"
fi

if [ "$ALL_TARGETS" = "1" ]; then
  [ "${#TARGETS[@]}" = "0" ] || die "--all 不能与 --target 同时使用"
  [ -z "$OUTPUT_OVERRIDE" ] || die "--all 不能与 --output 同时使用"
  [ -z "${RIRICLOUD_AGENT_BINARY_PATH:-}" ] || die "--all 不能与 RIRICLOUD_AGENT_BINARY_PATH 同时使用"
  TARGETS=(linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64)
fi

if [ "${#TARGETS[@]}" = "0" ]; then
  CURRENT_GOOS="${GOOS:-$($GO_BIN env GOOS)}"
  CURRENT_GOARCH="${GOARCH:-$($GO_BIN env GOARCH)}"
  TARGETS=("$CURRENT_GOOS/$CURRENT_GOARCH")
fi

[ "${#TARGETS[@]}" = "1" ] || [ -z "$OUTPUT_OVERRIDE" ] || die "多个目标平台不能共用 --output"

for target in "${TARGETS[@]}"; do
  build_target "$target"
done
