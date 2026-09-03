#!/usr/bin/env bash
# scripts/build-binaries.sh: 编译并准备多平台 Agent 与 Sing-box 二进制产物
# 统一输出至 artifacts/binaries/
set -euo pipefail

RIRI_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RIRI_ROOT"

if [ -f "$RIRI_ROOT/scripts/dev-env.sh" ]; then
  # shellcheck source=scripts/dev-env.sh
  . "$RIRI_ROOT/scripts/dev-env.sh"
fi

die() {
  echo "二进制构建失败：$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
用法：bash scripts/build-binaries.sh [选项]

编译并准备多平台 Agent 与定制 Sing-box 内核，输出至 artifacts/binaries/。

选项：
  --all                 编译全量平台（Agent 5 平台 + Sing-box Linux 双架构）
  --agent-only          仅构建 Agent
  --singbox-only        仅构建/准备 Sing-box
  --target <target>     指定单一目标（如 linux/amd64、linux/arm64、windows/amd64）
  --output-dir <dir>    指定产物输出目录（默认 artifacts/binaries）
  --version <version>   指定 Agent/应用版本（默认读取 package.json）
  --singbox-version <version>  指定独立 Sing-box 上游版本（默认 SINGBOX_VERSION 或 1.14.0）
  --singbox-revision <n>        指定 Sing-box 内部资源修订号（默认 SINGBOX_REVISION 或 1）
  --cronet-version <version>    指定 libcronet 版本（默认 CRONET_VERSION）
  -h, --help            显示帮助
EOF
}

TARGETS=()
BUILD_AGENT=1
BUILD_SINGBOX=1
VERSION=""
OUTPUT_DIR=""
SINGBOX_VERSION_ARG=""
SINGBOX_REVISION_ARG=""
CRONET_VERSION_ARG=""

while [ $# -gt 0 ]; do
  case "$1" in
    --all)
      TARGETS=(linux/amd64 linux/arm64 windows/amd64 darwin/amd64 darwin/arm64)
      shift
      ;;
    --agent-only)
      BUILD_AGENT=1
      BUILD_SINGBOX=0
      shift
      ;;
    --singbox-only)
      BUILD_AGENT=0
      BUILD_SINGBOX=1
      shift
      ;;
    --target)
      [ $# -ge 2 ] || die "--target 缺少参数"
      TARGETS+=("$2")
      shift 2
      ;;
    --output-dir)
      [ $# -ge 2 ] || die "--output-dir 缺少参数"
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --version)
      [ $# -ge 2 ] || die "--version 缺少参数"
      VERSION="$2"
      shift 2
      ;;
    --singbox-version)
      [ $# -ge 2 ] || die "--singbox-version 缺少参数"
      SINGBOX_VERSION_ARG="$2"
      shift 2
      ;;
    --singbox-revision)
      [ $# -ge 2 ] || die "--singbox-revision 缺少参数"
      SINGBOX_REVISION_ARG="$2"
      shift 2
      ;;
    --cronet-version)
      [ $# -ge 2 ] || die "--cronet-version 缺少参数"
      CRONET_VERSION_ARG="$2"
      shift 2
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

resolve_go
resolve_node

if [ -z "$VERSION" ]; then
  VERSION="$($NODE_BIN -p "require('./package.json').version")"
fi

OUTPUT_DIR="${OUTPUT_DIR:-$RIRI_ROOT/artifacts/binaries}"
mkdir -p "$OUTPUT_DIR/agent" "$OUTPUT_DIR/singbox"

if [ "${#TARGETS[@]}" = "0" ]; then
  TARGETS=(linux/amd64 linux/arm64 windows/amd64 darwin/amd64 darwin/arm64)
fi

# ---------- 构建 Agent ----------
if [ "$BUILD_AGENT" = "1" ]; then
  echo "==> 构建 Agent 多平台产物（版本：v${VERSION}）"
  for target in "${TARGETS[@]}"; do
    target_clean="${target//\//-}"
    GOOS_FLAG="${target%%/*}"
    GOARCH_FLAG="${target#*/}"
    case "$GOARCH_FLAG" in
      x86_64) GOARCH_FLAG="amd64" ;;
      aarch64) GOARCH_FLAG="arm64" ;;
    esac
    BIN="riri-agent"
    [ "$GOOS_FLAG" = "windows" ] && BIN="riri-agent.exe"

    OUT="$OUTPUT_DIR/agent/${GOOS_FLAG}-${GOARCH_FLAG}/$BIN"
    mkdir -p "$(dirname "$OUT")"
    bash "$RIRI_ROOT/scripts/build-agent.sh" \
      --target "${GOOS_FLAG}/${GOARCH_FLAG}" \
      --output "$OUT" \
      --version "$VERSION" \
      --release
  done
fi

# ---------- 构建 / 准备 Sing-box ----------
if [ "$BUILD_SINGBOX" = "1" ]; then
  echo "==> 准备 Sing-box 定制内核（Linux 双架构）"
  SINGBOX_VERSION="${SINGBOX_VERSION_ARG:-${SINGBOX_VERSION:-1.14.0}}"
  SINGBOX_REVISION="${SINGBOX_REVISION_ARG:-${SINGBOX_REVISION:-1}}"
  CRONET_VERSION="${CRONET_VERSION_ARG:-${CRONET_VERSION:-v150.0.7871.63-2}}"
  [[ "$SINGBOX_REVISION" =~ ^[0-9]+$ ]] || die "Sing-box revision 必须是正整数"
  [ "$SINGBOX_REVISION" -ge 1 ] || die "Sing-box revision 必须大于 0"
  RESOURCE_VERSION="${SINGBOX_VERSION}-r${SINGBOX_REVISION}"
  DOWNLOAD_DIR="$RIRI_ROOT/.cache/sing-box-v2ray-api/$SINGBOX_VERSION/r${SINGBOX_REVISION}/${CRONET_VERSION}"

  for arch in amd64 arm64; do
    # 检查是否在当前请求的目标列表中
    match=0
    for target in "${TARGETS[@]}"; do
      if [ "$target" = "linux/$arch" ] || [ "$target" = "linux-$arch" ]; then
        match=1
        break
      fi
    done
    [ "$match" = "1" ] || continue

    CACHE_DIR="$DOWNLOAD_DIR/linux-${arch}"
    mkdir -p "$CACHE_DIR"

    # 1. 确保源码存在
    if [ ! -d "$DOWNLOAD_DIR/sing-box-${SINGBOX_VERSION}" ]; then
      echo "获取 Sing-box v$SINGBOX_VERSION 源码..."
      TMP_ARCHIVE="$DOWNLOAD_DIR/sing-box.tar.gz"
      curl --fail --silent --show-error --location \
        "https://github.com/SagerNet/sing-box/archive/refs/tags/v${SINGBOX_VERSION}.tar.gz" \
        --output "$TMP_ARCHIVE"
      tar -xzf "$TMP_ARCHIVE" -C "$DOWNLOAD_DIR"
    fi

    # 2. 确保 libcronet.so 存在
    if [ ! -f "$CACHE_DIR/libcronet.so" ]; then
      echo "获取 NaiveProxy purego 运行库 ($arch)..."
      curl --fail --silent --show-error --location \
        "https://github.com/SagerNet/cronet-go/releases/download/${CRONET_VERSION}/libcronet-linux-${arch}.so" \
        --output "$CACHE_DIR/libcronet.so"
      chmod 0755 "$CACHE_DIR/libcronet.so"
    fi

    # 3. 确保定制二进制存在
    if [ ! -f "$CACHE_DIR/sing-box" ]; then
      echo "编译定制 Sing-box linux/$arch..."
      (
        cd "$DOWNLOAD_DIR/sing-box-${SINGBOX_VERSION}"
        CGO_ENABLED=0 GOOS=linux GOARCH="$arch" "$GO_BIN" build -trimpath \
          -tags with_v2ray_api,with_utls,with_quic,with_naive_outbound,with_purego \
          -ldflags "-s -w" \
          -o "$CACHE_DIR/sing-box" ./cmd/sing-box
      )
    fi

    # 4. 复制到输出目录
    DEST_DIR="$OUTPUT_DIR/singbox/$RESOURCE_VERSION/linux-${arch}"
    mkdir -p "$DEST_DIR"
    cp "$CACHE_DIR/sing-box" "$DEST_DIR/sing-box"
    cp "$CACHE_DIR/libcronet.so" "$DEST_DIR/libcronet.so"
    chmod +x "$DEST_DIR/sing-box"
    # 旧目录继续保留，兼容旧版 bundle、开发脚本和外部安装器。
    LEGACY_DIR="$OUTPUT_DIR/singbox/linux-${arch}"
    mkdir -p "$LEGACY_DIR"
    cp "$CACHE_DIR/sing-box" "$LEGACY_DIR/sing-box"
    cp "$CACHE_DIR/libcronet.so" "$LEGACY_DIR/libcronet.so"
    chmod +x "$LEGACY_DIR/sing-box"
    echo "Sing-box linux/$arch 已就绪：$DEST_DIR/sing-box"
  done
fi

# ---------- 生成资源 manifest ----------
SINGBOX_VERSION="${SINGBOX_VERSION_ARG:-${SINGBOX_VERSION:-}}"
SINGBOX_REVISION="${SINGBOX_REVISION_ARG:-${SINGBOX_REVISION:-1}}"
CRONET_VERSION="${CRONET_VERSION_ARG:-${CRONET_VERSION:-}}"
MANIFEST_PATH="$OUTPUT_DIR/manifest.json"
"$NODE_BIN" -e '
  const fs = require("fs");
  const path = require("path");
  const [root, appVersion, singboxVersion, singboxRevision, cronetVersion] = process.argv.slice(1);
  const resources = [];
  const stat = (file) => {
    const body = fs.readFileSync(file);
    const crypto = require("crypto");
    return { sha256: crypto.createHash("sha256").update(body).digest("hex"), size: body.length };
  };
  const addResource = (kind, upstreamVersion, revision, target, files, extra = {}) => {
    if (!files.every((file) => fs.existsSync(file.path))) return;
    resources.push({
      kind, upstreamVersion, revision, source: "BUILTIN", status: "ACTIVE",
      builtFromAppVersion: appVersion, isDefault: true, ...extra,
      assets: [{ target, os: target.split("-")[1], arch: target.split("-")[2], files: files.map((file) => {
        const info = stat(file.path);
        return { name: file.name, role: file.role, path: path.relative(root, file.path).split(path.sep).join("/"), ...info };
      }) }]
    });
  };
  for (const platform of ["linux-amd64", "linux-arm64", "windows-amd64", "darwin-amd64", "darwin-arm64"]) {
    const agentName = platform.startsWith("windows") ? "riri-agent.exe" : "riri-agent";
    const targetPlatform = platform.replace(/^darwin-/, "macos-");
    addResource("AGENT", appVersion, 1, `agent-${targetPlatform}`, [{ name: agentName, role: "main", path: path.join(root, "agent", platform, agentName) }]);
  }
  if (singboxVersion) {
    const resourceVersion = `${singboxVersion}-r${singboxRevision}`;
    for (const platform of ["linux-amd64", "linux-arm64"]) {
      const dir = path.join(root, "singbox", resourceVersion, platform);
      addResource("SINGBOX", singboxVersion, Number(singboxRevision), `singbox-${platform}`, [
        { name: "sing-box", role: "main", path: path.join(dir, "sing-box") },
        { name: "libcronet.so", role: "auxiliary", path: path.join(dir, "libcronet.so") }
      ], { cronetVersion });
    }
  }
  fs.writeFileSync(path.join(root, "manifest.json"), `${JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), applicationVersion: appVersion, resources }, null, 2)}\n`);
' "$OUTPUT_DIR" "$VERSION" "$SINGBOX_VERSION" "$SINGBOX_REVISION" "$CRONET_VERSION"

echo "==> 二进制产物准备完成：$OUTPUT_DIR"
