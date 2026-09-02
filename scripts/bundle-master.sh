#!/usr/bin/env bash
# scripts/bundle-master.sh: 组装指定宿主架构的主控端自包含发行包
set -euo pipefail

RIRI_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RIRI_ROOT"

if [ -f "$RIRI_ROOT/scripts/dev-env.sh" ]; then
  # shellcheck source=scripts/dev-env.sh
  . "$RIRI_ROOT/scripts/dev-env.sh"
fi

die() {
  echo "主控包组装失败：$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
用法：bash scripts/bundle-master.sh [选项]

组装指定宿主架构的主控端生产发行包（包含生产依赖、Web 面板、启动脚本与对应架构的内置 Agent/Sing-box）。

选项：
  --target <target>     指定宿主架构（默认 linux-amd64，支持 linux-arm64）
  --version <version>   指定版本号（默认读取 package.json）
  --worktree <path>     指定源码工作区目录（默认当前仓根目录）
  --output-dir <path>   指定装配目标目录（默认 artifacts/master/<target>）
  --archive-dir <path>  指定压缩归档输出目录（默认 artifacts/packages）
  --no-archive          仅装配目录，不生成 .tar.gz 压缩包
  -h, --help            显示帮助
EOF
}

to_os_path() {
  local p="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$p"
  elif command -v wslpath >/dev/null 2>&1; then
    wslpath -w "$p"
  else
    printf '%s\n' "$p"
  fi
}

TARGET="linux-amd64"
VERSION=""
WORKTREE_DIR="$RIRI_ROOT"
OUTPUT_DIR=""
ARCHIVE_DIR=""
DO_ARCHIVE=1

while [ $# -gt 0 ]; do
  case "$1" in
    --target)
      [ $# -ge 2 ] || die "--target 缺少参数"
      TARGET="$2"
      shift 2
      ;;
    --version)
      [ $# -ge 2 ] || die "--version 缺少参数"
      VERSION="$2"
      shift 2
      ;;
    --worktree)
      [ $# -ge 2 ] || die "--worktree 缺少参数"
      WORKTREE_DIR="$2"
      shift 2
      ;;
    --output-dir)
      [ $# -ge 2 ] || die "--output-dir 缺少参数"
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --archive-dir)
      [ $# -ge 2 ] || die "--archive-dir 缺少参数"
      ARCHIVE_DIR="$2"
      shift 2
      ;;
    --no-archive)
      DO_ARCHIVE=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "未知选项：$1"
      ;;
  esac
done

resolve_node() {
  NODE_BIN="${NODE_BIN:-node}"
  if ! command -v "$NODE_BIN" >/dev/null 2>&1 && command -v node.exe >/dev/null 2>&1; then
    NODE_BIN="node.exe"
  fi
  command -v "$NODE_BIN" >/dev/null 2>&1 || die "缺少 Node.js 工具链（node 或 node.exe）"
}

resolve_node

if [ -z "$VERSION" ]; then
  PACKAGE_JSON_OS="$(to_os_path "$WORKTREE_DIR/package.json")"
  VERSION="$($NODE_BIN -e "const fs = require('fs'); console.log(JSON.parse(fs.readFileSync(process.argv[1], 'utf8')).version)" "$PACKAGE_JSON_OS")"
fi

TARGET_NORM="${TARGET//\//-}"
TARGET_UNDERSCORE="${TARGET//-/_}"
ARTIFACT_ROOT="${RIRICLOUD_ARTIFACT_DIR:-$RIRI_ROOT/artifacts}"
MASTER_DIR="${OUTPUT_DIR:-$ARTIFACT_ROOT/master/$TARGET_NORM}"
ARCHIVE_DIR="${ARCHIVE_DIR:-$ARTIFACT_ROOT/packages}"

echo "==> 装配主控端发行包（目标架构：$TARGET_NORM，版本：v$VERSION）"
rm -rf "$MASTER_DIR"
mkdir -p "$MASTER_DIR"

# 1. 部署生产依赖与编译产物
echo "  -> 部署主控服务端生产依赖..."
(
  cd "$WORKTREE_DIR"
  pnpm --filter @riricloud/server deploy --prod --ignore-scripts "$(to_os_path "$MASTER_DIR")"
)
rm -rf "$MASTER_DIR/node_modules/.pnpm/node_modules"

# 2. 规范化符号链接为相对路径
echo "  -> 改写符号链接为包内相对路径..."
"$NODE_BIN" - "$(to_os_path "$MASTER_DIR")" <<'NODE'
const fs = require('fs');
const path = require('path');

const targetArg = process.argv.slice(1).find((arg) => arg && arg !== '-' && arg !== '[stdin]') || process.argv[1];
const root = path.resolve(targetArg);
let normalized = 0;

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      const target = path.resolve(path.dirname(entryPath), fs.readlinkSync(entryPath));
      const relativeToRoot = path.relative(root, target);
      if (relativeToRoot.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToRoot)) {
        throw new Error(`发行包符号链接指向包外路径：${entryPath} -> ${target}`);
      }
      const relativeTarget = path.relative(path.dirname(entryPath), target) || '.';
      const targetType = fs.statSync(target).isDirectory() ? 'dir' : 'file';
      fs.unlinkSync(entryPath);
      fs.symlinkSync(relativeTarget, entryPath, targetType);
      normalized += 1;
      continue;
    }
    if (entry.isDirectory()) walk(entryPath);
  }
}

walk(root);
console.log(`    已将 ${normalized} 个发行包内部绝对符号链接改写为相对链接`);
NODE

rm -rf "$MASTER_DIR/src" "$MASTER_DIR/tsconfig.json" "$MASTER_DIR/tsconfig.build.json" "$MASTER_DIR/nest-cli.json"

# 3. 复制启动入口与配置模板
echo "  -> 复制启动脚本与配置模板..."
cp "$WORKTREE_DIR/scripts/master-bundle/start.sh" "$MASTER_DIR/"
cp "$WORKTREE_DIR/scripts/master-bundle/README.md" "$MASTER_DIR/"
cp "$WORKTREE_DIR/scripts/master-bundle/.env.example" "$MASTER_DIR/"
cp "$WORKTREE_DIR/scripts/master-bundle/admin-reset.sh" "$MASTER_DIR/"
chmod +x "$MASTER_DIR/start.sh" "$MASTER_DIR/admin-reset.sh"

# 4. 复制前端面板静态资源
echo "  -> 集成 Web 前端静态资源..."
if [ ! -d "$WORKTREE_DIR/apps/web/dist" ]; then
  (cd "$WORKTREE_DIR" && pnpm --filter @riricloud/web build)
fi
mkdir -p "$MASTER_DIR/web-dist"
cp -r "$WORKTREE_DIR/apps/web/dist/." "$MASTER_DIR/web-dist/"

# 5. 精确注入对应架构的内置 Agent 与 Sing-box 二进制
echo "  -> 注入匹配架构 ($TARGET_NORM) 的内置 Agent 与 Sing-box..."
mkdir -p "$MASTER_DIR/binaries"

AGENT_SRC="$ARTIFACT_ROOT/binaries/agent/$TARGET_NORM/riri-agent"
if [ ! -f "$AGENT_SRC" ]; then
  echo "    未找到 $AGENT_SRC，尝试实时构建 Agent..."
  bash "$RIRI_ROOT/scripts/build-binaries.sh" --agent-only --target "$TARGET" --version "$VERSION"
fi
[ -f "$AGENT_SRC" ] || die "缺少匹配架构的 Agent 二进制：$AGENT_SRC"
cp "$AGENT_SRC" "$MASTER_DIR/binaries/agent-$TARGET_NORM"
chmod +x "$MASTER_DIR/binaries/agent-$TARGET_NORM"

SINGBOX_SRC="$ARTIFACT_ROOT/binaries/singbox/$TARGET_NORM/sing-box"
CRONET_SRC="$ARTIFACT_ROOT/binaries/singbox/$TARGET_NORM/libcronet.so"
if [ ! -f "$SINGBOX_SRC" ] || [ ! -f "$CRONET_SRC" ]; then
  echo "    未找到 Sing-box/libcronet，尝试实时构建/获取..."
  bash "$RIRI_ROOT/scripts/build-binaries.sh" --singbox-only --target "$TARGET" --version "$VERSION"
fi
[ -f "$SINGBOX_SRC" ] || die "缺少匹配架构的 Sing-box 二进制：$SINGBOX_SRC"
[ -f "$CRONET_SRC" ] || die "缺少匹配架构的 libcronet.so：$CRONET_SRC"
cp "$SINGBOX_SRC" "$MASTER_DIR/binaries/singbox-$TARGET_NORM"
cp "$CRONET_SRC" "$MASTER_DIR/binaries/libcronet.so"
chmod +x "$MASTER_DIR/binaries/singbox-$TARGET_NORM"

# 6. 固化 package.json 并生成 Prisma 引擎
echo "  -> 固化 package.json 并生成 Prisma Client..."
"$NODE_BIN" -e "const fs = require('fs'); fs.writeFileSync(process.argv[1], JSON.stringify({ name: 'riricloud-master', version: process.argv[2], private: true, prisma: { seed: 'node prisma/seed.js' } }, null, 2))" "$(to_os_path "$MASTER_DIR/package.json")" "$VERSION"
(cd "$MASTER_DIR" && "$NODE_BIN" node_modules/prisma/build/index.js generate >/dev/null)

# 7. 打包为 tar.gz
if [ "$DO_ARCHIVE" = "1" ]; then
  mkdir -p "$ARCHIVE_DIR"
  ARCHIVE_FILE="$ARCHIVE_DIR/riri-master_${VERSION}_${TARGET_UNDERSCORE}.tar.gz"
  echo "  -> 打包归档：$ARCHIVE_FILE..."
  tar -czf "$ARCHIVE_FILE" -C "$(dirname "$MASTER_DIR")" "$(basename "$MASTER_DIR")"
  echo "==> 主控端发行包组装完成：$ARCHIVE_FILE"
else
  echo "==> 主控端发行包目录组装完成：$MASTER_DIR"
fi