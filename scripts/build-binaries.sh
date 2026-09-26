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

is_windows_shell() {
  case "$(uname -s 2>/dev/null || true)" in
    MINGW*|MSYS*|CYGWIN*) return 0 ;;
    *) return 1 ;;
  esac
}

resolve_go() {
  GO_BIN="${GO_BIN:-go}"
  if is_windows_shell; then
    if ! command -v "$GO_BIN" >/dev/null 2>&1 && ! command -v go.exe >/dev/null 2>&1 && [ -d "$RIRI_ROOT/.tools/go/bin" ]; then
      export PATH="$RIRI_ROOT/.tools/go/bin:$PATH"
    fi
    if ! command -v "$GO_BIN" >/dev/null 2>&1 && command -v go.exe >/dev/null 2>&1; then
      GO_BIN="go.exe"
    fi
    command -v "$GO_BIN" >/dev/null 2>&1 || die "缺少 Go 工具链（go 或 go.exe）"
  else
    case "$GO_BIN" in
      *.exe) die "Linux/WSL 环境严禁调用 Windows Go 工具链（$GO_BIN），请在当前系统中安装原生 Go" ;;
    esac
    command -v "$GO_BIN" >/dev/null 2>&1 || die "缺少原生 Go 工具链（Linux/WSL 下严禁回退调用 Windows go.exe）"
    if [ "$("$GO_BIN" env GOHOSTOS 2>/dev/null || true)" = "windows" ]; then
      die "检测到当前 go 指向 Windows 工具链（GOHOSTOS=windows），Linux/WSL 下必须使用原生 Go"
    fi
  fi
}

resolve_node() {
  NODE_BIN="${NODE_BIN:-node}"
  if is_windows_shell; then
    if ! command -v "$NODE_BIN" >/dev/null 2>&1 && command -v node.exe >/dev/null 2>&1; then
      NODE_BIN="node.exe"
    fi
    command -v "$NODE_BIN" >/dev/null 2>&1 || die "缺少 Node.js 工具链（node 或 node.exe）"
  else
    case "$NODE_BIN" in
      *.exe) die "Linux/WSL 环境严禁调用 Windows Node.js 工具链（$NODE_BIN），请在当前系统中安装原生 Node.js" ;;
    esac
    command -v "$NODE_BIN" >/dev/null 2>&1 || die "缺少原生 Node.js 工具链（Linux/WSL 下严禁回退调用 Windows node.exe）"
    if [ "$("$NODE_BIN" -p 'process.platform' 2>/dev/null || true)" = "win32" ]; then
      die "检测到当前 node 指向 Windows 工具链（win32），Linux/WSL 下必须使用原生 Node.js"
    fi
  fi
}

to_go_path() {
  local p="$1"
  if is_windows_shell && [[ "${GO_BIN:-go}" == *.exe ]] && command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$p"
  else
    printf '%s\n' "$p"
  fi
}

to_node_path() {
  local p="$1"
  if is_windows_shell && [[ "${NODE_BIN:-node}" == *.exe ]] && command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$p"
  else
    printf '%s\n' "$p"
  fi
}

verify_binary_header() {
  local file_path="$1"
  local expected_os="$2"
  local expected_arch="$3"
  local native_path
  native_path="$(to_node_path "$file_path")"
  "$NODE_BIN" -e '
    const fs = require("fs");
    const [file, os, arch] = process.argv.slice(1);
    if (!fs.existsSync(file)) process.exit(2);
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(256);
    const n = fs.readSync(fd, buf, 0, 256, 0);
    fs.closeSync(fd);
    const header = buf.subarray(0, n);
    let actual = "unknown";
    if (header.length >= 20 && header[0] === 0x7f && header[1] === 0x45 && header[2] === 0x4c && header[3] === 0x46) {
      const le = header[5] === 1;
      const machine = le ? header.readUInt16LE(18) : header.readUInt16BE(18);
      const archMap = { 0x3e: "amd64", 0xb7: "arm64", 0x28: "arm", 0x03: "386" };
      actual = `linux/${archMap[machine] || "0x" + machine.toString(16)}`;
    } else if (header.length >= 8 && (header.readUInt32LE(0) === 0xfeedfacf || header.readUInt32BE(0) === 0xfeedfacf)) {
      const le = header.readUInt32LE(0) === 0xfeedfacf;
      const cpu = le ? header.readUInt32LE(4) : header.readUInt32BE(4);
      const archMap = { 0x01000007: "amd64", 0x0100000c: "arm64" };
      actual = `darwin/${archMap[cpu] || "0x" + cpu.toString(16)}`;
    } else if (header.length >= 0x40 && header[0] === 0x4d && header[1] === 0x5a) {
      const pe = header.readUInt32LE(0x3c);
      if (pe >= 0 && pe + 6 <= header.length && header[pe] === 0x50 && header[pe + 1] === 0x45 && header[pe + 2] === 0 && header[pe + 3] === 0) {
        const machine = header.readUInt16LE(pe + 4);
        const archMap = { 0x8664: "amd64", 0xaa64: "arm64", 0x014c: "386" };
        actual = `windows/${archMap[machine] || "0x" + machine.toString(16)}`;
      } else {
        actual = "windows/pe";
      }
    }
    const expected = `${os}/${arch}`;
    if (actual !== expected) {
      console.error(`二进制文件头校验失败: ${file} 期望 ${expected}，实际检测到 ${actual}`);
      process.exit(1);
    }
  ' "$native_path" "$expected_os" "$expected_arch"
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

# ---------- 内嵌资产占位备份与还原机制 ----------
EMBEDDED_ASSET="$RIRI_ROOT/apps/agent/internal/embedded/assets/singbox.tar.gz"
PLACEHOLDER_BAK="$RIRI_ROOT/apps/agent/internal/embedded/assets/.placeholder.tar.gz"

if [ -f "$EMBEDDED_ASSET" ] && [ ! -f "$PLACEHOLDER_BAK" ]; then
  cp "$EMBEDDED_ASSET" "$PLACEHOLDER_BAK"
fi

restore_placeholder() {
  if [ -f "$PLACEHOLDER_BAK" ]; then
    cp -f "$PLACEHOLDER_BAK" "$EMBEDDED_ASSET" || true
    rm -f "$PLACEHOLDER_BAK" || true
  fi
  git -C "$RIRI_ROOT" checkout -- "$EMBEDDED_ASSET" >/dev/null 2>&1 || true
}
trap restore_placeholder EXIT

SINGBOX_VERSION="${SINGBOX_VERSION_ARG:-${SINGBOX_VERSION:-1.14.0}}"
SINGBOX_REVISION="${SINGBOX_REVISION_ARG:-${SINGBOX_REVISION:-2}}"
CRONET_VERSION="${CRONET_VERSION_ARG:-${CRONET_VERSION:-v150.0.7871.63-2}}"
[[ "$SINGBOX_REVISION" =~ ^[0-9]+$ ]] || die "Sing-box revision 必须是正整数"
[ "$SINGBOX_REVISION" -ge 1 ] || die "Sing-box revision 必须大于 0"
RESOURCE_VERSION="${SINGBOX_VERSION}-r${SINGBOX_REVISION}"

# ---------- 1. 构建 / 准备 Sing-box 定制内核 ----------
if [ "$BUILD_SINGBOX" = "1" ]; then
  echo "==> 准备 Sing-box 定制内核（版本：${RESOURCE_VERSION}）"
  DOWNLOAD_DIR="$RIRI_ROOT/.cache/sing-box-v2ray-api/$SINGBOX_VERSION/r${SINGBOX_REVISION}/${CRONET_VERSION}"
  mkdir -p "$DOWNLOAD_DIR"

  # 1.1 确保源码存在并已打入 Clash API inboundUser 补丁
  if [ ! -d "$DOWNLOAD_DIR/sing-box-${SINGBOX_VERSION}" ]; then
    echo "获取 Sing-box v$SINGBOX_VERSION 源码..."
    TMP_ARCHIVE="$DOWNLOAD_DIR/sing-box.tar.gz"
    curl --fail --silent --show-error --location \
      "https://github.com/SagerNet/sing-box/archive/refs/tags/v${SINGBOX_VERSION}.tar.gz" \
      --output "$TMP_ARCHIVE"
    tar -xzf "$TMP_ARCHIVE" -C "$DOWNLOAD_DIR"
  fi

  SINGBOX_SOURCE_DIR="$DOWNLOAD_DIR/sing-box-${SINGBOX_VERSION}"
  CLASH_API_PATCH="$RIRI_ROOT/apps/agent/patches/sing-box-clashapi-inbound-user.patch"
  CLASH_API_SOURCE="$SINGBOX_SOURCE_DIR/experimental/clashapi/connections.go"
  if ! grep -q '"inboundUser"' "$CLASH_API_SOURCE"; then
    command -v patch >/dev/null 2>&1 || die "缺少 patch 工具：无法应用 Sing-box 设备追踪补丁"
    (cd "$SINGBOX_SOURCE_DIR" && patch -p1 < "$CLASH_API_PATCH")
  fi

  for raw_target in "${TARGETS[@]}"; do
    target="$raw_target"
    if [[ "$target" == *"-"* ]] && [[ "$target" != *"/"* ]]; then
      target="${target/-//}"
    fi
    target_os="${target%%/*}"
    target_arch="${target#*/}"
    case "$target_arch" in
      x86_64) target_arch="amd64" ;;
      aarch64) target_arch="arm64" ;;
    esac

    SB_BIN="sing-box"
    [ "$target_os" = "windows" ] && SB_BIN="sing-box.exe"

    CACHE_DIR="$DOWNLOAD_DIR/${target_os}-${target_arch}"
    mkdir -p "$CACHE_DIR"

    # 1.2 Linux 双架构额外获取 libcronet.so
    if [ "$target_os" = "linux" ] && { [ "$target_arch" = "amd64" ] || [ "$target_arch" = "arm64" ]; }; then
      if [ -f "$CACHE_DIR/libcronet.so" ] && ! verify_binary_header "$CACHE_DIR/libcronet.so" "$target_os" "$target_arch" 2>/dev/null; then
        echo "检测到缓存的 libcronet.so 架构不匹配 ($target_os/$target_arch)，清理并重新获取..."
        rm -f "$CACHE_DIR/libcronet.so"
      fi
      if [ ! -f "$CACHE_DIR/libcronet.so" ]; then
        echo "获取 NaiveProxy purego 运行库 ($target_os/$target_arch)..."
        curl --fail --silent --show-error --location \
          "https://github.com/SagerNet/cronet-go/releases/download/${CRONET_VERSION}/libcronet-linux-${target_arch}.so" \
          --output "$CACHE_DIR/libcronet.so"
        chmod 0755 "$CACHE_DIR/libcronet.so"
      fi
      verify_binary_header "$CACHE_DIR/libcronet.so" "$target_os" "$target_arch" \
        || die "libcronet.so 二进制格式与目标架构 ($target_os/$target_arch) 不匹配"
    fi

    # 1.3 确保含 Clash API 用户元数据与版本注入的定制二进制存在且架构匹配
    if [ -f "$CACHE_DIR/$SB_BIN" ] && ! verify_binary_header "$CACHE_DIR/$SB_BIN" "$target_os" "$target_arch" 2>/dev/null; then
      echo "检测到缓存的 Sing-box 二进制格式与目标架构 ($target_os/$target_arch) 不匹配，清理失效缓存并强制重编..."
      rm -f "$CACHE_DIR/$SB_BIN" "$CACHE_DIR/.riri-device-tracking-v2"
    fi

    if [ ! -f "$CACHE_DIR/$SB_BIN" ] || [ ! -f "$CACHE_DIR/.riri-device-tracking-v2" ]; then
      echo "编译定制 Sing-box ${target_os}/${target_arch}..."
      (
        cd "$SINGBOX_SOURCE_DIR"
        go_sb_out="$(to_go_path "$CACHE_DIR/$SB_BIN")"
        CGO_ENABLED=0 GOOS="$target_os" GOARCH="$target_arch" "$GO_BIN" build -trimpath \
          -tags with_v2ray_api,with_utls,with_quic,with_naive_outbound,with_purego,with_clash_api,with_riri_device_tracking \
          -ldflags "-s -w -X github.com/sagernet/sing-box/constant.Version=${SINGBOX_VERSION}" \
          -o "$go_sb_out" ./cmd/sing-box
      )
      if ! verify_binary_header "$CACHE_DIR/$SB_BIN" "$target_os" "$target_arch"; then
        rm -f "$CACHE_DIR/$SB_BIN" "$CACHE_DIR/.riri-device-tracking-v2" || true
        die "编译出的 Sing-box 二进制格式与目标架构 ($target_os/$target_arch) 不匹配"
      fi
      touch "$CACHE_DIR/.riri-device-tracking-v2"
    fi

    # 1.4 复制到输出目录
    DEST_DIR="$OUTPUT_DIR/singbox/$RESOURCE_VERSION/${target_os}-${target_arch}"
    mkdir -p "$DEST_DIR"
    cp "$CACHE_DIR/$SB_BIN" "$DEST_DIR/$SB_BIN"
    chmod +x "$DEST_DIR/$SB_BIN"
    if [ -f "$CACHE_DIR/libcronet.so" ]; then
      cp "$CACHE_DIR/libcronet.so" "$DEST_DIR/libcronet.so"
    fi
    # 旧目录继续保留，兼容旧版 bundle、开发脚本和外部安装器。
    LEGACY_DIR="$OUTPUT_DIR/singbox/${target_os}-${target_arch}"
    mkdir -p "$LEGACY_DIR"
    cp "$CACHE_DIR/$SB_BIN" "$LEGACY_DIR/$SB_BIN"
    chmod +x "$LEGACY_DIR/$SB_BIN"
    if [ -f "$CACHE_DIR/libcronet.so" ]; then
      cp "$CACHE_DIR/libcronet.so" "$LEGACY_DIR/libcronet.so"
    fi
    echo "Sing-box ${target_os}/${target_arch} 已就绪：$DEST_DIR/$SB_BIN"
  done
fi

pack_embedded_kernel() {
  local target_os="$1"
  local target_arch="$2"
  local src_dir="$OUTPUT_DIR/singbox/$RESOURCE_VERSION/${target_os}-${target_arch}"
  local sb_bin="sing-box"
  [ "$target_os" = "windows" ] && sb_bin="sing-box.exe"

  if [ -f "$src_dir/$sb_bin" ]; then
    verify_binary_header "$src_dir/$sb_bin" "$target_os" "$target_arch" \
      || die "拒绝内嵌格式不匹配的 Sing-box 二进制 ($src_dir/$sb_bin)"
    if [ -f "$src_dir/libcronet.so" ]; then
      verify_binary_header "$src_dir/libcronet.so" "$target_os" "$target_arch" \
        || die "拒绝内嵌格式不匹配的 libcronet.so ($src_dir/libcronet.so)"
    fi
    echo "    -> 内嵌 Sing-box 定制内核至 Agent ($target_os-$target_arch)..."
    (
      cd "$src_dir"
      local files=("$sb_bin")
      [ -f "libcronet.so" ] && files+=("libcronet.so")
      tar -czf "$EMBEDDED_ASSET" "${files[@]}"
    )
    return 0
  fi
  return 1
}

# ---------- 2. 构建 Agent（内嵌当前平台内核） ----------
if [ "$BUILD_AGENT" = "1" ]; then
  echo "==> 构建 Agent 多平台产物（版本：v${VERSION}）"
  for target in "${TARGETS[@]}"; do
    if [[ "$target" == *"-"* ]] && [[ "$target" != *"/"* ]]; then
      target="${target/-//}"
    fi
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

    # 若对应平台的定制 Sing-box 已存在，打包为 gzip 注入 embed；否则使用占位
    pack_embedded_kernel "$GOOS_FLAG" "$GOARCH_FLAG" || restore_placeholder

    bash "$RIRI_ROOT/scripts/build-agent.sh" \
      --target "${GOOS_FLAG}/${GOARCH_FLAG}" \
      --output "$OUT" \
      --version "$VERSION" \
      --release

    # 构建完立即还原占位符，保持工作区代码树干净
    restore_placeholder
  done
fi

# ---------- 生成资源 manifest ----------
MANIFEST_PATH="$OUTPUT_DIR/manifest.json"
"$NODE_BIN" -e '
  const fs = require("fs");
  const path = require("path");
  const [root, appVersion] = process.argv.slice(1);
  const resources = [];
  const stat = (file) => {
    const body = fs.readFileSync(file);
    const crypto = require("crypto");
    return { sha256: crypto.createHash("sha256").update(body).digest("hex"), size: body.length };
  };
  const assets = [];
  for (const platform of ["linux-amd64", "linux-arm64", "windows-amd64", "darwin-amd64", "darwin-arm64"]) {
    const agentName = platform.startsWith("windows") ? "riri-agent.exe" : "riri-agent";
    const filePath = path.join(root, "agent", platform, agentName);
    if (!fs.existsSync(filePath)) continue;
    const targetPlatform = platform.replace(/^darwin-/, "macos-");
    const target = `agent-${targetPlatform}`;
    const info = stat(filePath);
    assets.push({
      target,
      os: target.split("-")[1],
      arch: target.split("-")[2],
      files: [{ name: agentName, role: "main", path: path.relative(root, filePath).split(path.sep).join("/"), ...info }]
    });
  }
  if (assets.length > 0) {
    resources.push({
      kind: "AGENT",
      upstreamVersion: appVersion,
      revision: 1,
      source: "LOCAL",
      status: "ACTIVE",
      builtFromAppVersion: appVersion,
      isDefault: true,
      assets
    });
  }
  fs.writeFileSync(path.join(root, "manifest.json"), `${JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), applicationVersion: appVersion, resources }, null, 2)}\n`);
' "$(to_node_path "$OUTPUT_DIR")" "$VERSION"

echo "==> 二进制产物准备完成：$OUTPUT_DIR"
