#!/usr/bin/env bash
# 本地发布脚本：前置校验 → 三端门禁 → 多平台构建 → 打包校验 → 创建 GitHub Release
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
  echo "[1/6] Tag $TAG 已存在，检出该提交构建"
else
  NEW_TAG=1
  echo "[1/6] 将在当前 main HEAD 创建附注 Tag $TAG"
fi

# ---------- 在 Tag 提交上执行门禁与构建（worktree 隔离） ----------
WORKTREE="$RIRI_ROOT/.cache/release-worktree"
DIST="$RIRI_ROOT/.cache/release"
rm -rf "$WORKTREE" "$DIST"

[ "$NEW_TAG" = 1 ] && git tag -a "$TAG" -m "release $TAG" HEAD
git worktree add --detach "$WORKTREE" "$TAG" >/dev/null
cleanup() { git -C "$RIRI_ROOT" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "[2/6] 安装依赖并复跑三端质量门禁（与 CI 同一套命令）"
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

echo "[3/6] 交叉编译 Agent 三平台产物（CGO=0，版本号 ldflags 注入）"
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

echo "[4/6] 打包并生成 SHA-256 校验和"
cd "$DIST"
tar -czf "riri-agent_${VERSION}_linux_amd64.tar.gz" "riri-agent_${VERSION}_linux_amd64"
tar -czf "riri-agent_${VERSION}_linux_arm64.tar.gz" "riri-agent_${VERSION}_linux_arm64"
# Git Bash 无 zip，回退 PowerShell Compress-Archive
if command -v zip >/dev/null 2>&1; then
  zip -q -r "riri-agent_${VERSION}_windows_amd64.zip" "riri-agent_${VERSION}_windows_amd64"
else
  powershell -NoProfile -Command "Compress-Archive -Path '$(cygpath -m "$DIST")/riri-agent_${VERSION}_windows_amd64' -DestinationPath '$(cygpath -m "$DIST")/riri-agent_${VERSION}_windows_amd64.zip'"
fi
sha256sum "riri-agent_${VERSION}_linux_amd64.tar.gz" \
          "riri-agent_${VERSION}_linux_arm64.tar.gz" \
          "riri-agent_${VERSION}_windows_amd64.zip" > checksums.txt

echo "[5/6] 提取 CHANGELOG 版本小节为 Release Notes"
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

echo "[6/6] 创建 GitHub Release（本地构建产物）"
cd "$RIRI_ROOT"
if [ "$NEW_TAG" = 1 ]; then
  git push origin "$TAG"
fi
gh release create "$TAG" \
  --title "$TAG" \
  --notes-file "$DIST/release-notes.md" \
  "$DIST/riri-agent_${VERSION}_linux_amd64.tar.gz" \
  "$DIST/riri-agent_${VERSION}_linux_arm64.tar.gz" \
  "$DIST/riri-agent_${VERSION}_windows_amd64.zip" \
  "$DIST/checksums.txt"

echo "发布完成：$TAG（产物与校验和见 GitHub Release）"
