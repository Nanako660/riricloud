#!/usr/bin/env bash
# 开发环境变量：所有依赖缓存与便携工具链全部收进项目目录（.cache/ 与 .tools/ 均不入库）。
# 用法：source scripts/dev-env.sh（需在 Git Bash 中执行；cmd/PowerShell 用户请改用 Git Bash）
RIRI_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

# Node / pnpm：corepack 下载缓存与 npm 元数据缓存
export COREPACK_HOME="$(cygpath -m "$RIRI_ROOT/.cache/corepack")"
export npm_config_cache="$(cygpath -m "$RIRI_ROOT/.cache/npm")"

# Prisma CLI 二进制缓存
export PRISMA_CACHE_DIR="$(cygpath -m "$RIRI_ROOT/.cache/prisma")"

# Go：便携工具链（.tools/go）+ 模块/构建缓存全部本地化；未解压工具链时保持系统 PATH
if [ -d "$RIRI_ROOT/.tools/go" ]; then
  export GOROOT="$(cygpath -m "$RIRI_ROOT/.tools/go")"
  export GOPATH="$(cygpath -m "$RIRI_ROOT/.cache/go/path")"
  export GOMODCACHE="$(cygpath -m "$RIRI_ROOT/.cache/go/mod")"
  export GOCACHE="$(cygpath -m "$RIRI_ROOT/.cache/go/build")"
  export GOTMPDIR="$(cygpath -m "$RIRI_ROOT/.cache/go/tmp")"
  export GOTOOLCHAIN=local
  export PATH="$RIRI_ROOT/.tools/go/bin:$PATH"
fi
