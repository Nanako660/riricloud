#!/usr/bin/env bash
# 本地发布脚本：前置校验 → 三端门禁 → Agent 多平台构建 + 主控端自包含发行包 → 打包校验 → 创建 GitHub Release
# 用法：bash scripts/release.sh [vX.Y.Z]（缺省使用根 package.json 版本号）
#
# 约束（docs/VERSIONING.md §3/§5/§6）：
#   - Tag 必须与根 package.json 统一版本号一致（唯一版本源）
#   - Tag 与 CHANGELOG 版本小节一一对应
#   - 构建产物取自 Tag 指向的提交（git worktree 隔离，不污染工作区）
set -euo pipefail

RIRI_ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$RIRI_ROOT"

# shellcheck source=scripts/dev-env.sh
. "$RIRI_ROOT/scripts/dev-env.sh"

die() { echo "发布失败：$*" >&2; exit 1; }

# ---------- 参数与前置校验 ----------
VERSION="$(node -p "require('./package.json').version")"
TAG="${1:-v${VERSION}}"

[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || die "必须在 main 分支执行发布"
[ -z "$(git status --porcelain)" ] || die "工作区不干净，请先提交或暂存变更"
git fetch origin main --quiet
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || die "本地 main 与 origin/main 不一致，请先 git pull"
[ "v${VERSION}" = "$TAG" ] || die "Tag $TAG 与根 package.json 版本 v$VERSION 不一致（唯一版本源规则，见 docs/VERSIONING.md §3）"
grep -q "^## \[${VERSION}\]" CHANGELOG.md || die "CHANGELOG.md 未找到 [${VERSION}] 版本小节（Tag 与 CHANGELOG 一一对应，见 docs/VERSIONING.md §5）"
command -v gh >/dev/null 2>&1 || die "缺少 gh CLI"
gh auth status >/dev/null 2>&1 || die "gh CLI 未登录"
if gh release view "$TAG" >/dev/null 2>&1; then
  die "Release $TAG 已存在；如需重建请先执行 gh release delete $TAG --yes"
fi

if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  git merge-base --is-ancestor "$TAG" main || die "Tag $TAG 不在 main 历史上"
  NEW_TAG=0
  echo "[1/8] Tag $TAG 已存在，检出该提交构建"
else
  NEW_TAG=1
  echo "[1/8] 将在当前 main HEAD 创建附注 Tag $TAG"
fi

# ---------- 在 Tag 提交上执行门禁与构建（worktree 隔离） ----------
WORKTREE="$RIRI_ROOT/.cache/release-worktree"
DIST="$RIRI_ROOT/.cache/release"
rm -rf "$WORKTREE" "$DIST"

[ "$NEW_TAG" = 1 ] && git tag -a "$TAG" -m "release $TAG" HEAD
git worktree add --detach "$WORKTREE" "$TAG" >/dev/null
cleanup() { git -C "$RIRI_ROOT" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "[2/8] 安装依赖并复跑三端质量门禁（与 CI 同一套命令）"
cd "$WORKTREE"
pnpm install --frozen-lockfile
pnpm --filter @riricloud/server exec tsc --noEmit
pnpm --filter @riricloud/server lint
pnpm --filter @riricloud/server test
pnpm --filter @riricloud/server build
pnpm --filter @riricloud/web exec tsc --noEmit
pnpm --filter @riricloud/web lint
pnpm --filter @riricloud/web build
bash scripts/gate-agent.sh

echo "[3/8] 交叉编译 Agent 三平台产物（CGO=0，版本号 ldflags 注入）"
mkdir -p "$DIST"
cd "$WORKTREE/apps/agent"
for platform in "linux amd64 riri-agent" "linux arm64 riri-agent" "windows amd64 riri-agent.exe"; do
  set -- $platform
  GOOS_FLAG=$1
  GOARCH_FLAG=$2
  BIN=$3
  DIR="$DIST/riri-agent_${VERSION}_${GOOS_FLAG}_${GOARCH_FLAG}"
  mkdir -p "$DIR"
  CGO_ENABLED=0 GOOS="$GOOS_FLAG" GOARCH="$GOARCH_FLAG" go build -trimpath \
    -ldflags "-X main.Version=${VERSION}" -o "$DIR/$BIN" .
done

echo "[4/8] 装配主控端自包含发行包（生产依赖 + Web 面板 + 启动脚本）"
MASTER_DIR="$DIST/riri-master_${VERSION}_linux_amd64"
# pnpm deploy 须在 worktree 内执行（读取其 lockfile 与 workspace 依赖拓扑）
cd "$WORKTREE"
pnpm --filter @riricloud/server deploy --prod "$MASTER_DIR"
rm -rf "$MASTER_DIR/src" "$MASTER_DIR/tsconfig.json" "$MASTER_DIR/tsconfig.build.json" \
  "$MASTER_DIR/nest-cli.json" "$MASTER_DIR/node_modules/.pnpm/node_modules"
# 启动入口与配置模板（scripts/master-bundle 维护）
cp "$RIRI_ROOT/scripts/master-bundle/start.sh" "$MASTER_DIR/"
cp "$RIRI_ROOT/scripts/master-bundle/README.md" "$MASTER_DIR/"
cp "$RIRI_ROOT/scripts/master-bundle/.env.example" "$MASTER_DIR/"
chmod +x "$MASTER_DIR/start.sh"
# Web 面板静态资源（main.ts 经 WEB_DIST_PATH 探测的三级布局之一）
mkdir -p "$MASTER_DIR/web-dist"
cp -r "$WORKTREE/apps/web/dist/." "$MASTER_DIR/web-dist/"
# 将同版本 Agent 运行时复制进主控分发中心，供节点升级和安装脚本内网直连下载。
mkdir -p "$MASTER_DIR/binaries"
cp "$DIST/riri-agent_${VERSION}_linux_amd64/riri-agent" "$MASTER_DIR/binaries/agent-linux-amd64"
cp "$DIST/riri-agent_${VERSION}_linux_arm64/riri-agent" "$MASTER_DIR/binaries/agent-linux-arm64"
if [ -f "$DIST/riri-agent_${VERSION}_windows_amd64/riri-agent.exe" ]; then
  cp "$DIST/riri-agent_${VERSION}_windows_amd64/riri-agent.exe" "$MASTER_DIR/binaries/agent-windows-amd64"
fi
# Sing-box 由发布机或 CI 通过 SINGBOX_BINARY_DIR 提供；未提供时管理员仍可在后台导入。
SINGBOX_SOURCE_DIR="${SINGBOX_BINARY_DIR:-$RIRI_ROOT/.tools/sing-box}"
for target in linux-amd64 linux-arm64 windows-amd64; do
  case "$target" in
    windows-amd64) FILE_NAME="sing-box.exe" ;;
    *) FILE_NAME="sing-box" ;;
  esac
  if [ -f "$SINGBOX_SOURCE_DIR/$target/$FILE_NAME" ]; then
    cp "$SINGBOX_SOURCE_DIR/$target/$FILE_NAME" "$MASTER_DIR/binaries/singbox-$target"
  elif [ -f "$SINGBOX_SOURCE_DIR/$FILE_NAME" ] && [ "$target" = "windows-amd64" ]; then
    cp "$SINGBOX_SOURCE_DIR/$FILE_NAME" "$MASTER_DIR/binaries/singbox-$target"
  fi
done
# 版本号唯一源：system.service 读取 cwd/package.json；prisma.seed 供 db seed 命令使用
# 路径经 argv 传入（MSYS 对参数做自动路径转换；内嵌 -e 脚本字符串则不会，Windows 下会得到 D:\d\... 坏路径）
node -e "const fs = require('fs'); fs.writeFileSync(process.argv[1], JSON.stringify({ name: 'riricloud-master', version: process.argv[2], private: true, prisma: { seed: 'node prisma/seed.js' } }, null, 2))" "$MASTER_DIR/package.json" "$VERSION"
# 产物内生成 Prisma client（native 引擎供发布机冒烟；目标机 start.sh 首启重新 generate 生成 Linux 引擎）
(cd "$MASTER_DIR" && node node_modules/prisma/build/index.js generate >/dev/null)

echo "[5/8] 打包并生成 SHA-256 校验和"
cd "$DIST"
tar -czf "riri-agent_${VERSION}_linux_amd64.tar.gz" "riri-agent_${VERSION}_linux_amd64"
tar -czf "riri-agent_${VERSION}_linux_arm64.tar.gz" "riri-agent_${VERSION}_linux_arm64"
# Git Bash 无 zip，回退 PowerShell Compress-Archive
if command -v zip >/dev/null 2>&1; then
  zip -q -r "riri-agent_${VERSION}_windows_amd64.zip" "riri-agent_${VERSION}_windows_amd64"
else
  powershell -NoProfile -Command "Compress-Archive -Path '$(cygpath -m "$DIST")/riri-agent_${VERSION}_windows_amd64' -DestinationPath '$(cygpath -m "$DIST")/riri-agent_${VERSION}_windows_amd64.zip'"
fi
tar -czf "riri-master_${VERSION}_linux_amd64.tar.gz" "riri-master_${VERSION}_linux_amd64"
sha256sum "riri-agent_${VERSION}_linux_amd64.tar.gz" \
          "riri-agent_${VERSION}_linux_arm64.tar.gz" \
          "riri-agent_${VERSION}_windows_amd64.zip" \
          "riri-master_${VERSION}_linux_amd64.tar.gz" > checksums.txt

echo "[6/8] 提取 CHANGELOG 版本小节为发布说明"
node -e '
  const fs = require("fs");
  const version = process.argv[1];
  const md = fs.readFileSync(process.argv[3], "utf8");
  const start = md.indexOf(`## [${version}]`);
  if (start < 0) { console.error(`CHANGELOG.md 未找到 [${version}] 小节`); process.exit(1); }
  let end = md.indexOf("\n## [", start + 1);
  if (end < 0) end = md.length;
  fs.writeFileSync(process.argv[2], md.slice(start, end).trim() + "\n");
' "$VERSION" "$DIST/release-notes.md" "$WORKTREE/CHANGELOG.md"

echo "[7/8] 创建 GitHub Release（本地构建产物，覆盖主控端与 Agent）"
cd "$RIRI_ROOT"
if [ "$NEW_TAG" = 1 ]; then
  git push origin "$TAG"
fi
gh release create "$TAG" \
  --title "$TAG" \
  --notes-file "$DIST/release-notes.md" \
  "$DIST/riri-master_${VERSION}_linux_amd64.tar.gz" \
  "$DIST/riri-agent_${VERSION}_linux_amd64.tar.gz" \
  "$DIST/riri-agent_${VERSION}_linux_arm64.tar.gz" \
  "$DIST/riri-agent_${VERSION}_windows_amd64.zip" \
  "$DIST/checksums.txt"

echo "[8/8] 发布完成：$TAG（主控端发行包 + Agent 三平台产物见 GitHub Release）"
