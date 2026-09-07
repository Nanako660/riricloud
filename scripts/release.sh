#!/usr/bin/env bash
# 本地发布脚本：前置校验 → 三端门禁 → Agent 与 Sing-box 编译 → 主控端发行包组装 → 打包校验 → GitHub Release
# 用法：bash scripts/release.sh [选项] [vX.Y.Z]
#
# 选项：
#   --dry-run       演练模式：完整执行构建、打包与校验，不上推 Tag、不发布 GitHub Release
#   --skip-build    复用已有 artifacts/packages 产物，直接发布
#   -h, --help      显示帮助
set -euo pipefail

RIRI_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RIRI_ROOT"

if [ -f "$RIRI_ROOT/scripts/dev-env.sh" ]; then
  # shellcheck source=scripts/dev-env.sh
  . "$RIRI_ROOT/scripts/dev-env.sh"
fi

die() { echo "发布失败：$*" >&2; exit 1; }

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

remove_dir_safe() {
  local dir="$1"
  [ -d "$dir" ] || return 0
  chmod -R u+w "$dir" 2>/dev/null || true
  rm -rf "$dir" 2>/dev/null || true
}

DRY_RUN=0
SKIP_BUILD=0
TAG_PARAM=""
RELEASE_TARGET="master"

while [ $# -gt 0 ]; do
  case "$1" in
    --master)
      RELEASE_TARGET="master"
      shift
      ;;
    --agent)
      RELEASE_TARGET="agent"
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    -h|--help)
      cat <<'EOF'
用法：bash scripts/release.sh [选项] [tag]

选项：
  --master        发布 Master 主控端（默认，Tag 为 vX.Y.Z，产物输出至 artifacts/packages/master）
  --agent         发布 Agent 边缘程序（Tag 为 agent-vA.B.C，产物输出至 artifacts/packages/agent）
  --dry-run       演练模式：完整执行构建、打包与校验，不上推 Tag、不发布 GitHub Release
  --skip-build    复用已有 artifacts/packages/<target> 产物直接执行发布
  -h, --help      显示帮助
EOF
      exit 0
      ;;
    v[0-9]*|agent-v[0-9]*)
      TAG_PARAM="$1"
      shift
      ;;
    *)
      die "未知参数：$1"
      ;;
  esac
done

if [ "$RELEASE_TARGET" = "master" ]; then
  echo "==> 发布目标：Master 主控端（模式：$([ "$DRY_RUN" = "1" ] && echo "演练 dry-run" || echo "正式 release")）"
else
  echo "==> 发布目标：Agent 边缘程序（模式：$([ "$DRY_RUN" = "1" ] && echo "演练 dry-run" || echo "正式 release")）"
fi

resolve_node() {
  NODE_BIN="${NODE_BIN:-node}"
  if ! command -v "$NODE_BIN" >/dev/null 2>&1 && command -v node.exe >/dev/null 2>&1; then
    NODE_BIN="node.exe"
  fi
  command -v "$NODE_BIN" >/dev/null 2>&1 || die "缺少 Node.js 工具链（node 或 node.exe）"
}

resolve_node

VERSION="$($NODE_BIN -e "const fs = require('fs'); console.log(JSON.parse(fs.readFileSync('package.json', 'utf8')).version)")"
if [ -f "apps/agent/VERSION" ]; then
  AGENT_VERSION="$(tr -d '[:space:]' < "apps/agent/VERSION")"
else
  AGENT_VERSION="$VERSION"
fi

SINGBOX_VERSION="${SINGBOX_VERSION:-1.14.0}"
SINGBOX_REVISION="${SINGBOX_REVISION:-1}"
CRONET_VERSION="${CRONET_VERSION:-v150.0.7871.63-2}"

# ---------- 前置校验 ----------
if [ "$RELEASE_TARGET" = "master" ]; then
  TAG="${TAG_PARAM:-v${VERSION}}"
  echo "[1/7] 检查 Master 前置条件与版本一致性（目标版本：$TAG）"
  [ "v${VERSION}" = "$TAG" ] || die "Tag $TAG 与根 package.json 版本 v$VERSION 不一致（见 docs/VERSIONING.md）"
  grep -q "^## \[${VERSION}\]" CHANGELOG.md || die "CHANGELOG.md 未找到 [${VERSION}] 版本小节（见 docs/VERSIONING.md）"
  CHANGELOG_FILE="$RIRI_ROOT/CHANGELOG.md"
  NOTES_VERSION="$VERSION"
else
  TAG="${TAG_PARAM:-agent-v${AGENT_VERSION}}"
  echo "[1/7] 检查 Agent 前置条件与版本一致性（目标版本：$TAG）"
  [ "agent-v${AGENT_VERSION}" = "$TAG" ] || die "Tag $TAG 与 apps/agent/VERSION agent-v$AGENT_VERSION 不一致（见 docs/VERSIONING.md）"
  [ -f "apps/agent/CHANGELOG.md" ] || die "缺少 apps/agent/CHANGELOG.md"
  grep -q "^## \[${AGENT_VERSION}\]" apps/agent/CHANGELOG.md || die "apps/agent/CHANGELOG.md 未找到 [${AGENT_VERSION}] 版本小节（见 docs/VERSIONING.md）"
  CHANGELOG_FILE="$RIRI_ROOT/apps/agent/CHANGELOG.md"
  NOTES_VERSION="$AGENT_VERSION"
fi

if [ "$DRY_RUN" = "0" ]; then
  [ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || die "正式发布必须在 main 分支执行"
  [ -z "$(git status --porcelain)" ] || die "工作区不干净，请先提交或暂存变更"
  git fetch origin main --quiet
  [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || die "本地 main 与 origin/main 不一致，请先 git pull"
  command -v gh >/dev/null 2>&1 || die "缺少 gh CLI"
  gh auth status >/dev/null 2>&1 || die "gh CLI 未登录"
  if gh release view "$TAG" >/dev/null 2>&1; then
    die "Release $TAG 已存在；如需重建请先执行 gh release delete $TAG --yes"
  fi
fi

NEW_TAG=0
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "  -> Tag $TAG 已存在，复用现有 Tag"
else
  NEW_TAG=1
  if [ "$DRY_RUN" = "0" ]; then
    echo "  -> 创建附注 Tag $TAG"
    git tag -a "$TAG" -m "release $TAG" HEAD
  else
    echo "  -> [dry-run] 模拟创建 Tag $TAG"
  fi
fi

ARTIFACT_ROOT="${RIRICLOUD_ARTIFACT_DIR:-$RIRI_ROOT/artifacts}"
BINARIES_DIR="$ARTIFACT_ROOT/binaries"
PACKAGE_DIR="$ARTIFACT_ROOT/packages/$RELEASE_TARGET"
WORKTREE="$RIRI_ROOT/.cache/release-worktree"

cleanup() {
  if [ -d "$WORKTREE" ]; then
    echo "清理临时 release-worktree..."
    git -C "$RIRI_ROOT" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
    git -C "$RIRI_ROOT" worktree prune >/dev/null 2>&1 || true
    remove_dir_safe "$WORKTREE"
  fi
  if [ "$DRY_RUN" = "1" ] && [ "$NEW_TAG" = "1" ]; then
    git tag -d "$TAG" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [ "$SKIP_BUILD" = "0" ]; then
  remove_dir_safe "$PACKAGE_DIR"
  mkdir -p "$PACKAGE_DIR"

  # ---------- Worktree 隔离 ----------
  echo "[2/7] 准备独立构建工作区（git worktree）"
  git -C "$RIRI_ROOT" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  git -C "$RIRI_ROOT" worktree prune >/dev/null 2>&1 || true
  remove_dir_safe "$WORKTREE"
  git worktree add --detach "$WORKTREE" HEAD >/dev/null

  if [ "$RELEASE_TARGET" = "master" ]; then
    echo "[3/7] 在工作区中执行三端全量质量门禁"
    (
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
    )

    echo "[4/7] 准备主控端内置目标架构（linux-amd64）Agent 与 Sing-box 二进制"
    bash "$RIRI_ROOT/scripts/build-binaries.sh" --target linux/amd64 --version "$AGENT_VERSION" \
      --singbox-version "$SINGBOX_VERSION" --singbox-revision "$SINGBOX_REVISION" --cronet-version "$CRONET_VERSION"

    echo "[5/7] 装配主控端生产发行包（linux-amd64）"
    bash "$RIRI_ROOT/scripts/bundle-master.sh" \
      --target linux-amd64 \
      --worktree "$WORKTREE" \
      --version "$VERSION" \
      --singbox-version "$SINGBOX_VERSION" \
      --singbox-revision "$SINGBOX_REVISION" \
      --archive-dir "$PACKAGE_DIR"

    echo "[6/7] 生成主控端校验和"
    (
      cd "$PACKAGE_DIR"
      sha256sum "riri-master_${VERSION}_linux_amd64.tar.gz" > "$PACKAGE_DIR/checksums.txt"
    )
  else
    echo "[3/7] 在工作区中执行 Agent 质量门禁"
    (
      cd "$WORKTREE"
      pnpm install --frozen-lockfile
      bash scripts/gate-agent.sh
    )

    echo "[4/7] 编译多平台 Agent 程序"
    bash "$RIRI_ROOT/scripts/build-binaries.sh" --agent-only --all --version "$AGENT_VERSION"

    echo "[5/7] 打包 Agent 多平台归档包"
    tar -czf "$PACKAGE_DIR/riri-agent_${AGENT_VERSION}_linux_amd64.tar.gz" -C "$BINARIES_DIR/agent/linux-amd64" riri-agent
    tar -czf "$PACKAGE_DIR/riri-agent_${AGENT_VERSION}_linux_arm64.tar.gz" -C "$BINARIES_DIR/agent/linux-arm64" riri-agent
    tar -czf "$PACKAGE_DIR/riri-agent_${AGENT_VERSION}_darwin_amd64.tar.gz" -C "$BINARIES_DIR/agent/darwin-amd64" riri-agent
    tar -czf "$PACKAGE_DIR/riri-agent_${AGENT_VERSION}_darwin_arm64.tar.gz" -C "$BINARIES_DIR/agent/darwin-arm64" riri-agent

    if command -v zip >/dev/null 2>&1; then
      (cd "$BINARIES_DIR/agent/windows-amd64" && zip -q "$PACKAGE_DIR/riri-agent_${AGENT_VERSION}_windows_amd64.zip" riri-agent.exe)
    else
      WIN_SRC="$(to_os_path "$BINARIES_DIR/agent/windows-amd64/riri-agent.exe")"
      WIN_DEST="$(to_os_path "$PACKAGE_DIR/riri-agent_${AGENT_VERSION}_windows_amd64.zip")"
      powershell -NoProfile -Command "Compress-Archive -Force -Path '$WIN_SRC' -DestinationPath '$WIN_DEST'"
    fi

    echo "[6/7] 生成 Agent 归档包校验和"
    (
      cd "$PACKAGE_DIR"
      sha256sum "riri-agent_${AGENT_VERSION}_linux_amd64.tar.gz" \
                "riri-agent_${AGENT_VERSION}_linux_arm64.tar.gz" \
                "riri-agent_${AGENT_VERSION}_darwin_amd64.tar.gz" \
                "riri-agent_${AGENT_VERSION}_darwin_arm64.tar.gz" \
                "riri-agent_${AGENT_VERSION}_windows_amd64.zip" > "$PACKAGE_DIR/checksums.txt"
    )
  fi
else
  [ -d "$PACKAGE_DIR" ] || die "未找到产物目录 $PACKAGE_DIR，无法使用 --skip-build"
  [ -f "$PACKAGE_DIR/checksums.txt" ] || die "未找到 $PACKAGE_DIR/checksums.txt，无法使用 --skip-build"
fi

# ---------- 提取发布说明 ----------
echo "  -> 提取版本发布说明（${NOTES_VERSION}）..."
"$NODE_BIN" -e '
  const fs = require("fs");
  const version = process.argv[1];
  const file = process.argv[3];
  const md = fs.readFileSync(file, "utf8");
  const start = md.indexOf(`## [${version}]`);
  if (start < 0) { console.error(`${file} 未找到 [${version}] 小节`); process.exit(1); }
  let end = md.indexOf("\n## [", start + 1);
  if (end < 0) end = md.length;
  fs.writeFileSync(process.argv[2], md.slice(start, end).trim() + "\n");
' "$NOTES_VERSION" "$(to_os_path "$PACKAGE_DIR/release-notes.md")" "$(to_os_path "$CHANGELOG_FILE")"

if [ "$DRY_RUN" = "1" ]; then
  echo ""
  echo "========================================================"
  echo " [dry-run] 演练完成！产物已生成至：$PACKAGE_DIR"
  echo "========================================================"
  cat "$PACKAGE_DIR/checksums.txt"
  echo "========================================================"
  echo "未推送 Tag，未调用 gh release create。"
  exit 0
fi

# ---------- 正式发布 ----------
echo "[7/7] 推送 Tag 并创建 GitHub Release"
if [ "$NEW_TAG" = "1" ]; then
  git push origin "$TAG"
fi

if [ "$RELEASE_TARGET" = "master" ]; then
  gh release create "$TAG" \
    --title "$TAG" \
    --notes-file "$PACKAGE_DIR/release-notes.md" \
    "$PACKAGE_DIR/riri-master_${VERSION}_linux_amd64.tar.gz" \
    "$PACKAGE_DIR/checksums.txt"
else
  gh release create "$TAG" \
    --title "$TAG" \
    --notes-file "$PACKAGE_DIR/release-notes.md" \
    "$PACKAGE_DIR/riri-agent_${AGENT_VERSION}_linux_amd64.tar.gz" \
    "$PACKAGE_DIR/riri-agent_${AGENT_VERSION}_linux_arm64.tar.gz" \
    "$PACKAGE_DIR/riri-agent_${AGENT_VERSION}_darwin_amd64.tar.gz" \
    "$PACKAGE_DIR/riri-agent_${AGENT_VERSION}_darwin_arm64.tar.gz" \
    "$PACKAGE_DIR/riri-agent_${AGENT_VERSION}_windows_amd64.zip" \
    "$PACKAGE_DIR/checksums.txt"
fi

echo "==> 发布完成：$TAG"
