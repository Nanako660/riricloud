#!/usr/bin/env bash
# 开发环境变量：本地开发时所有依赖缓存与便携工具链收进项目目录（.cache/ 与 .tools/ 均不入库）。
# 用法：source scripts/dev-env.sh（Git Bash / bash 通用）。
# CI 环境（CI=true）自动跳过缓存重定向，使用 runner 原生缓存机制。
RIRI_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

# 便携 Go 工具链注入（.tools/go 存在即启用，本地与 CI 通用）
if [ -d "$RIRI_ROOT/.tools/go" ]; then
  export GOROOT="$RIRI_ROOT/.tools/go"
  export PATH="$RIRI_ROOT/.tools/go/bin:$PATH"
  export GOTOOLCHAIN=local
fi

# CI：缓存走 runner 原生机制（setup-node/setup-go），到此为止
if [ -n "${CI:-}" ]; then
  return 0 2>/dev/null || exit 0
fi

# 本地：缓存统一收进项目目录（Windows Git Bash 需 cygpath 转混合路径，其他平台原样）
to_native() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi
}

mkdir -p "$RIRI_ROOT/.cache/pnpm" "$RIRI_ROOT/.cache/npm" "$RIRI_ROOT/.cache/corepack" \
  "$RIRI_ROOT/.cache/prisma" "$RIRI_ROOT/.cache/downloads" \
  "$RIRI_ROOT/.cache/go/mod" "$RIRI_ROOT/.cache/go/build" \
  "$RIRI_ROOT/.cache/go/tmp" "$RIRI_ROOT/.cache/go/path"

# Node / pnpm：corepack 下载缓存与 npm 元数据缓存
export COREPACK_HOME="$(to_native "$RIRI_ROOT/.cache/corepack")"
export npm_config_cache="$(to_native "$RIRI_ROOT/.cache/npm")"

# Prisma CLI 二进制缓存
export PRISMA_CACHE_DIR="$(to_native "$RIRI_ROOT/.cache/prisma")"

# Go：模块/构建缓存本地化（工具链已在上方注入）
if [ -d "$RIRI_ROOT/.tools/go" ]; then
  export GOPATH="$(to_native "$RIRI_ROOT/.cache/go/path")"
  export GOMODCACHE="$(to_native "$RIRI_ROOT/.cache/go/mod")"
  export GOCACHE="$(to_native "$RIRI_ROOT/.cache/go/build")"
  export GOTMPDIR="$(to_native "$RIRI_ROOT/.cache/go/tmp")"
fi
