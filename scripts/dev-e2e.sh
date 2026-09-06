#!/usr/bin/env bash
# 本地一键联调：主控端 + Web 面板 + Agent（真实 sing-box 内核）
#
# 用法（Git Bash / 任意 POSIX shell）：
#   bash scripts/dev-e2e.sh                  # 全套启动并跟踪 Agent 日志，Ctrl+C 退出
#   SKIP_WEB=1 bash scripts/dev-e2e.sh       # 不启动 Web 面板
#   USE_MASTER_LOCAL=0 bash scripts/dev-e2e.sh # 使用独立联调节点而不是 Master-Local
#   NODE_PORT=9443 USE_MASTER_LOCAL=0 bash scripts/dev-e2e.sh # 自定义独立节点端口
#   AGENT_TOKEN=xxx bash scripts/dev-e2e.sh  # 复用既有节点 Token（跳过自动建节点）
#
# 环境变量：SERVER_URL / SERVER_PORT / STATS_API_LISTEN / WEB_URL / ADMIN_EMAIL / ADMIN_PASSWORD / NODE_NAME / NODE_HOST / NODE_PORT / USE_MASTER_LOCAL / E2E_SYNC_RESOURCES
# 资源同步覆盖：E2E_RESOURCE_VERSION / E2E_AGENT_RESOURCE_FILE / E2E_AGENT_RESOURCE_TARGET / E2E_SINGBOX_RESOURCE_FILE / E2E_SINGBOX_RESOURCE_TARGET / E2E_SINGBOX_RESOURCE_VERSION
# sing-box 二进制查找顺序：SINGBOX_BINARY_PATH > .tools/sing-box/ > tools/ > PATH
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# 开发环境缓存/便携工具链（go、pnpm store），失败不致命（系统已装 go 时可直接用）
source scripts/dev-env.sh >/dev/null 2>&1 || true

SERVER_URL_OVERRIDE="${SERVER_URL:-}"
SERVER_URL="${SERVER_URL:-http://localhost:3000}"
WEB_URL="${WEB_URL:-http://localhost:5173}"
ADMIN_EMAIL="${SEED_ADMIN_EMAIL:-admin@riricloud.local}"
ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:-RiriCloud-Admin-2026!}"
NODE_NAME="${NODE_NAME:-local-e2e}"
NODE_HOST="${NODE_HOST:-127.0.0.1}"
NODE_PORT="${NODE_PORT:-8443}"
USE_MASTER_LOCAL="${USE_MASTER_LOCAL:-1}"
E2E_SYNC_RESOURCES="${E2E_SYNC_RESOURCES:-1}"
SERVER_PORT_SCAN_LIMIT="${SERVER_PORT_SCAN_LIMIT:-1000}"
SERVER_PORT_OVERRIDE="${SERVER_PORT:-${PORT:-}}"
STATS_API_LISTEN_OVERRIDE="${STATS_API_LISTEN:-}"
if [ -z "$SERVER_PORT_OVERRIDE" ] && [ -n "$SERVER_URL_OVERRIDE" ]; then
  SERVER_PORT_OVERRIDE="$(node -e 'try { const url = new URL(process.argv[1]); console.log(url.port || "3000") } catch { console.log("3000") }' "$SERVER_URL")"
fi
SERVER_PORT="${SERVER_PORT_OVERRIDE:-3000}"
if [ -n "$SERVER_PORT_OVERRIDE" ] && [ -z "$SERVER_URL_OVERRIDE" ]; then
  SERVER_URL="http://localhost:$SERVER_PORT"
fi
if [ -z "${JWT_SECRET:-}" ]; then
  JWT_SECRET="$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
fi
export JWT_SECRET

LOG_DIR="$ROOT/.cache/logs"
SINGBOX_CONF_DIR="$ROOT/.cache/agent"
mkdir -p "$LOG_DIR" "$SINGBOX_CONF_DIR"
COOKIE_JAR=""

say() { printf '\033[1;36m[dev-e2e]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[dev-e2e]\033[0m %s\n' "$*" >&2; exit 1; }

SERVER_PID=""
WEB_PID=""
AGENT_PID=""

cleanup() {
  [ -n "$AGENT_PID" ] && kill "$AGENT_PID" 2>/dev/null || true
  # 只回收本次脚本启动的服务；已在运行的复用实例保持不动
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  [ -n "$WEB_PID" ] && kill "$WEB_PID" 2>/dev/null || true
  [ -n "$COOKIE_JAR" ] && rm -f -- "$COOKIE_JAR"
}
trap cleanup EXIT INT TERM

# 从 stdin 的 JSON 提取顶层字段
jsonget() {
  node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const v=JSON.parse(d)[process.argv[1]];console.log(v==null?"":String(v))}catch{console.log("")}})' "$1"
}

jsonquote() {
  node -e 'console.log(JSON.stringify(process.argv[1]))' "$1"
}

sync_dev_resource() {
  local kind="$1"
  local target="$2"
  local file="$3"
  local version="$4"
  local filename="$5"
  [ -f "$file" ] || die "e2e 资源文件不存在：$file"
  RIRICLOUD_ADMIN_COOKIE_FILE="$COOKIE_JAR" node scripts/dev-e2e-sync-resource.mjs \
    --server-url "$SERVER_URL" \
    --kind "$kind" \
    --target "$target" \
    --version "$version" \
    --file "$file" \
    --filename "$filename" \
    --app-version "$E2E_APP_VERSION" \
    || die "同步 e2e $kind 资源失败"
}

master_agent_token() {
  (
    cd "$ROOT/apps/server"
    DATABASE_URL="${DATABASE_URL:-file:./dev.db}" node prisma/master-agent-config.js --token
  )
}

server_up() { curl -fsS --max-time 2 "$SERVER_URL/api/v1/system/version" >/dev/null 2>&1; }
web_up() { curl -fsS --max-time 2 "$WEB_URL" >/dev/null 2>&1; }

port_available() {
  node -e 'const net = require("net"); const port = Number(process.argv[1]); const server = net.createServer(); server.once("error", () => process.exit(1)); server.listen(port, "127.0.0.1", () => server.close(() => process.exit(0)));' "$1" >/dev/null 2>&1
}

pick_server_port() {
  local port="$1"
  for _ in $(seq 1 "$SERVER_PORT_SCAN_LIMIT"); do
    if port_available "$port"; then
      printf '%s' "$port"
      return 0
    fi
    port=$((port + 1))
  done
  return 1
}

find_singbox() {
  local candidates=(
    "${SINGBOX_BINARY_PATH:-}"
    "$ROOT/.tools/sing-box/sing-box.exe" "$ROOT/.tools/sing-box/sing-box"
    "$ROOT/.tools/sing-box.exe" "$ROOT/.tools/sing-box"
    "$ROOT/tools/sing-box.exe" "$ROOT/tools/sing-box"
  )
  local c
  for c in "${candidates[@]}"; do
    if [ -n "$c" ] && [ -x "$c" ]; then echo "$c"; return 0; fi
  done
  command -v sing-box || return 1
}

singbox_has_required_features() {
  local version_output="$1"
  local feature
  for feature in with_v2ray_api with_utls with_quic with_naive_outbound; do
    printf '%s\n' "$version_output" | grep -q "$feature" || return 1
  done
}

resolve_go() {
  GO_BIN="${GO_BIN:-go}"
  if ! command -v "$GO_BIN" >/dev/null 2>&1; then
    if command -v go.exe >/dev/null 2>&1; then
      GO_BIN="go.exe"
    elif [ -x "$ROOT/.tools/go/bin/go.exe" ]; then
      GO_BIN="$ROOT/.tools/go/bin/go.exe"
    else
      die "缺少 Go 工具链：无法构建带 V2Ray API 的 Sing-box，请安装 Go 或准备 .tools/go/"
    fi
  fi
}

build_singbox_for_dev() {
  resolve_go
  command -v curl >/dev/null 2>&1 || command -v curl.exe >/dev/null 2>&1 \
    || die "缺少 curl：无法获取 Sing-box 源码"
  command -v tar >/dev/null 2>&1 || command -v tar.exe >/dev/null 2>&1 \
    || die "缺少 tar：无法解压 Sing-box 源码"

  local curl_bin="curl"
  local tar_bin="tar"
  command -v "$curl_bin" >/dev/null 2>&1 || curl_bin="curl.exe"
  command -v "$tar_bin" >/dev/null 2>&1 || tar_bin="tar.exe"
  local version="${SINGBOX_VERSION:-1.14.0}"
  local cache_dir="$ROOT/.cache/sing-box-v2ray-api/$version"
  local source_dir="$cache_dir/sing-box-$version"
  local goos
  local goarch
  local output_dir
  local output_path
  local go_output_path

  goos="$($GO_BIN env GOOS)"
  goarch="$($GO_BIN env GOARCH)"
  output_dir="$cache_dir/$goos-$goarch"
  output_path="$output_dir/sing-box"
  [ "$goos" = "windows" ] && output_path="$output_path.exe"
  mkdir -p "$output_dir"

  if [ ! -d "$source_dir" ]; then
    say "获取开发联调所需的 Sing-box v$version 源码…"
    local archive_path="$cache_dir/sing-box.tar.gz"
    mkdir -p "$cache_dir"
    "$curl_bin" --fail --silent --show-error --location \
      "https://github.com/SagerNet/sing-box/archive/refs/tags/v$version.tar.gz" \
      --output "$archive_path"
    "$tar_bin" -xzf "$archive_path" -C "$cache_dir"
  fi

  if [ ! -f "$output_path" ]; then
    say "构建开发联调所需的 Sing-box v$version（with_v2ray_api,with_utls,with_quic,with_naive_outbound,with_purego）…"
    go_output_path="$output_path"
    case "$GO_BIN" in
      *.exe)
        command -v cygpath >/dev/null 2>&1 && go_output_path="$(cygpath -w "$output_path")"
        ;;
    esac
    (
      cd "$source_dir"
      CGO_ENABLED=0 GOOS="$goos" GOARCH="$goarch" "$GO_BIN" build -trimpath \
        -tags with_v2ray_api,with_utls,with_quic,with_naive_outbound,with_purego \
        -ldflags "-s -w" -o "$go_output_path" ./cmd/sing-box
    )
  fi

  SINGBOX_BIN="$output_path"
}

# ---------- 1. sing-box 内核 ----------
SINGBOX_BIN="$(find_singbox || true)"
if [ -n "$SINGBOX_BIN" ]; then
  say "sing-box 内核：$SINGBOX_BIN"
  SINGBOX_VERSION_OUTPUT="$($SINGBOX_BIN version)"
else
  SINGBOX_VERSION_OUTPUT=""
fi
if ! singbox_has_required_features "$SINGBOX_VERSION_OUTPUT"; then
  if [ -n "${SINGBOX_BINARY_PATH:-}" ]; then
    die "SINGBOX_BINARY_PATH 指定的 sing-box 未启用 with_v2ray_api/with_utls/with_quic/with_naive_outbound，请改用带这些构建标签的内核"
  fi
  [ -n "$SINGBOX_BIN" ] && say "当前缓存的 Sing-box 缺少联调所需构建标签，准备构建兼容版本…"
  build_singbox_for_dev
  say "sing-box 内核：$SINGBOX_BIN"
  SINGBOX_VERSION_OUTPUT="$($SINGBOX_BIN version)"
  singbox_has_required_features "$SINGBOX_VERSION_OUTPUT" \
    || die "自动构建的 Sing-box 仍缺少联调所需构建标签，请检查 SINGBOX_VERSION 或 Go 工具链"
fi

# ---------- 2. 主控端（已在跑则复用） ----------
DB_WAS_PRESENT=0
if [ -f apps/server/prisma/dev.db ]; then
  DB_WAS_PRESENT=1
fi
SERVER_ALREADY_UP=0
if server_up; then
  # 运行中的 Master 可能持有 SQLite WAL 写锁，迁移必须在启动服务前完成。
  SERVER_ALREADY_UP=1
  say "主控端已在 $SERVER_URL 运行，跳过数据库迁移并直接复用"
else
  say "检查并应用数据库迁移…"
  pnpm --filter @riricloud/server exec prisma migrate deploy || die "数据库迁移失败"
  if [ "$DB_WAS_PRESENT" = "0" ]; then
    say "初始化种子数据…"
    pnpm --filter @riricloud/server exec prisma db seed || die "数据库种子失败"
  fi
fi

if [ "$SERVER_ALREADY_UP" = "1" ]; then
  :
else
  if [ -z "$SERVER_PORT_OVERRIDE" ]; then
    SERVER_PORT_START="$SERVER_PORT"
    SERVER_PORT="$(pick_server_port "$SERVER_PORT_START")" \
      || die "未找到可用的主控端口（已从 $SERVER_PORT_START 开始探测 $SERVER_PORT_SCAN_LIMIT 个端口）；可通过 SERVER_PORT=xxxx 或 PORT=xxxx 指定"
    SERVER_URL="http://localhost:$SERVER_PORT"
    say "主控端默认端口不可用，改用 $SERVER_URL"
  fi
  if [ -z "$STATS_API_LISTEN_OVERRIDE" ]; then
    STATS_API_PORT_START="${STATS_API_PORT_START:-10085}"
    STATS_API_PORT="$(pick_server_port "$STATS_API_PORT_START")" \
      || die "未找到可用的 StatsService 端口（已从 $STATS_API_PORT_START 开始探测 $SERVER_PORT_SCAN_LIMIT 个端口）；可通过 STATS_API_LISTEN=127.0.0.1:xxxx 指定"
    STATS_API_LISTEN="127.0.0.1:$STATS_API_PORT"
    say "StatsService 默认端口不可用，改用 $STATS_API_LISTEN"
  fi
  rm -f apps/server/*.tsbuildinfo
  say "启动主控端（日志：$LOG_DIR/server.log）…"
  PORT="$SERVER_PORT" STATS_API_LISTEN="${STATS_API_LISTEN:-}" pnpm dev:server >"$LOG_DIR/server.log" 2>&1 &
  SERVER_PID=$!
  SERVER_READY=0
  for i in $(seq 1 60); do
    if server_up; then
      SERVER_READY=1
      break
    fi
    if grep -q 'Error:' "$LOG_DIR/server.log" 2>/dev/null; then
      say "主控端启动失败，最近日志：" >&2
      tail -n 40 "$LOG_DIR/server.log" >&2 || true
      die "主控端进程启动后立即退出"
    fi
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
      say "主控端进程已退出，最近日志：" >&2
      tail -n 40 "$LOG_DIR/server.log" >&2 || true
      die "主控端启动失败"
    fi
    sleep 1
  done
  [ "$SERVER_READY" = "1" ] || die "主控端 60s 内未就绪，查看 $LOG_DIR/server.log"
  say "主控端就绪：$SERVER_URL"
fi

# ---------- 3. Web 面板（可选） ----------
if [ "${SKIP_WEB:-0}" = "1" ]; then
  say "SKIP_WEB=1，跳过 Web 面板"
elif web_up; then
  say "Web 面板已在 $WEB_URL 运行，直接复用"
else
  say "启动 Web 面板（日志：$LOG_DIR/web.log）…"
  VITE_API_PROXY_TARGET="$SERVER_URL" pnpm dev:web >"$LOG_DIR/web.log" 2>&1 &
  WEB_PID=$!
fi

# ---------- 4. 登录管理员并准备联调节点 ----------
COOKIE_JAR="$(mktemp "$ROOT/.cache/dev-e2e-cookie.XXXXXX")"
chmod 600 "$COOKIE_JAR"
LOGIN_BODY=$(printf '{"email":"%s","password":"%s"}' "$ADMIN_EMAIL" "$ADMIN_PASSWORD")
LOGIN_RESULT="$(curl -fsS --max-time 5 -c "$COOKIE_JAR" -b "$COOKIE_JAR" -H 'Content-Type: application/json' -d "$LOGIN_BODY" "$SERVER_URL/api/v1/auth/login")"
ADMIN_AUTHENTICATED="$(printf '%s' "$LOGIN_RESULT" | jsonget authenticated)"
[ "$ADMIN_AUTHENTICATED" = "true" ] && grep -q $'\triricloud_access\t' "$COOKIE_JAR" \
  || die "管理员登录失败：请检查 ADMIN_EMAIL/ADMIN_PASSWORD（默认 admin@riricloud.local / RiriCloud-Admin-2026!）"

AUTH=(-b "$COOKIE_JAR")
AGENT_TOKEN="${AGENT_TOKEN:-}"
if [ -n "$AGENT_TOKEN" ]; then
  say "使用环境变量指定的 AGENT_TOKEN"
else
  # 默认复用 seed 预置的 Master-Local，保证面板中的本机节点与本地 Agent 是同一个实体。
  # USE_MASTER_LOCAL=0 时按地址查找独立联调节点（避免中文名经 Windows 控制台的编码问题）。
  NODE_LINE="$(curl -fsS --max-time 5 "${AUTH[@]}" "$SERVER_URL/api/v1/admin/nodes" \
    | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const nodes=JSON.parse(d)||[];const local=nodes.find(x=>x.isLocal&&x.name==="Master-Local")||nodes.find(x=>x.isLocal);const matched=nodes.find(x=>x.serverHost===process.argv[1]);const n=process.argv[2]==="1"?local:matched;console.log(n?[n.id,n.serverHost].join(" "):"")}catch{console.log("")}})' "$NODE_HOST" "$USE_MASTER_LOCAL")"
  if [ -n "$NODE_LINE" ]; then
    read -r NODE_ID NODE_HOST <<<"$NODE_LINE"
    if [ "$USE_MASTER_LOCAL" = "1" ]; then
      AGENT_TOKEN="$(master_agent_token)" || die "读取 Master-Local AgentToken 失败，请确认 DATABASE_URL 与主控使用的加密密钥一致"
      [ -n "$AGENT_TOKEN" ] || die "读取 Master-Local AgentToken 失败：返回为空"
      say "复用 Master-Local（$NODE_HOST）"
    else
      die "节点列表不会返回既有节点的 AgentToken；请通过 AGENT_TOKEN=... 显式提供凭证，或删除该节点后重新运行以创建联调节点"
    fi
  else
    say "创建联调节点「$NODE_NAME」（$NODE_HOST:$NODE_PORT）…"
    CREATE_BODY=$(printf '{"name":"%s","serverHost":"%s"}' "$NODE_NAME" "$NODE_HOST")
    CREATE_RESULT="$(curl -fsS --max-time 5 -X POST "${AUTH[@]}" -H 'Content-Type: application/json' -d "$CREATE_BODY" "$SERVER_URL/api/v1/admin/nodes")" || die "创建节点失败"
    NODE_ID="$(printf '%s' "$CREATE_RESULT" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).node.id)}catch{console.log("")}})')"
    AGENT_TOKEN="$(printf '%s' "$CREATE_RESULT" | jsonget agentToken)"
    [ -n "$AGENT_TOKEN" ] && [ -n "$NODE_ID" ] || die "创建节点失败"
  fi

  LINE_LINE="$(curl -fsS --max-time 5 "${AUTH[@]}" "$SERVER_URL/api/v1/admin/lines?page=1&pageSize=100" \
    | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const body=JSON.parse(d)||{};const lines=Array.isArray(body.data)?body.data:[];const nodeId=process.argv[1];const requestedPort=Number(process.argv[2]);const useLocal=process.argv[3]==="1";const direct=lines.filter(x=>x.type==="DIRECT"&&x.protocolType==="VLESS"&&x.entryNodeId===nodeId);const named=direct.find(x=>x.name==="Master 本机直连");const matched=useLocal?(named||direct[0]):direct.find(x=>x.entryPort===requestedPort);console.log(matched?[matched.id,matched.entryPort,matched.status].join(" "):"")}catch{console.log("")}})' "$NODE_ID" "$NODE_PORT" "$USE_MASTER_LOCAL")"
  if [ -n "$LINE_LINE" ]; then
    read -r LINE_ID NODE_PORT LINE_STATUS <<<"$LINE_LINE"
    if [ "$LINE_STATUS" != "ACTIVE" ]; then
      say "启用联调线路…"
      curl -fsS --max-time 5 -X PATCH "${AUTH[@]}" -H 'Content-Type: application/json' \
        -d '{"status":"ACTIVE"}' "$SERVER_URL/api/v1/admin/lines/$LINE_ID" >/dev/null || die "启用线路失败"
    fi
    say "复用 VLESS Reality 线路（端口 $NODE_PORT）"
  else
    say "创建 VLESS Reality 线路（端口 $NODE_PORT）…"
    LINE_PARAMS='{"flow":"xtls-rprx-vision","transport":{"type":"tcp"},"tls":{"enabled":true,"mode":"reality","serverName":"www.apple.com","reality":{"dest":"www.apple.com:443","serverNames":["www.apple.com"],"shortIds":["0123456789abcdef"]}}}'
    LINE_NAME="$(jsonquote "$NODE_NAME")"
    LINE_BODY="$(printf '{"name":%s,"type":"DIRECT","protocolType":"VLESS","params":%s,"entryNodeId":"%s","entryPort":%s,"tags":["e2e"],"isPublic":true,"status":"ACTIVE"}' \
      "$LINE_NAME" "$LINE_PARAMS" "$NODE_ID" "$NODE_PORT")"
    LINE_RESULT="$(curl -fsS --max-time 5 -X POST "${AUTH[@]}" -H 'Content-Type: application/json' \
      -d "$LINE_BODY" "$SERVER_URL/api/v1/admin/lines" 2>&1)" || die "创建线路失败：$LINE_RESULT"
    LINE_ID="$(printf '%s' "$LINE_RESULT" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).line.id)}catch{console.log("")}})')"
    [ -n "$LINE_ID" ] || die "创建线路失败：$LINE_RESULT"
  fi
fi

# ---------- 5. 构建并启动 Agent ----------
AGENT_GOOS="${GOOS:-$(go env GOOS)}"
AGENT_GOARCH="${GOARCH:-$(go env GOARCH)}"
if [ "$AGENT_GOOS" = "windows" ]; then
  AGENT_BIN_NAME="riri-agent.exe"
else
  AGENT_BIN_NAME="riri-agent"
fi
AGENT_BIN="${RIRICLOUD_AGENT_BINARY_PATH:-$ROOT/artifacts/dev/agent/${AGENT_GOOS}-${AGENT_GOARCH}/$AGENT_BIN_NAME}"
say "构建 Agent…"
RIRICLOUD_AGENT_BINARY_PATH="$AGENT_BIN" bash scripts/build-agent.sh || die "Agent 构建失败"

if [ "$E2E_SYNC_RESOURCES" = "1" ]; then
  E2E_APP_VERSION="${E2E_APP_VERSION:-$(node -p "require('./package.json').version")}"
  E2E_RESOURCE_VERSION="${E2E_RESOURCE_VERSION:-$E2E_APP_VERSION}"
  RESOURCE_OS="$AGENT_GOOS"
  [ "$RESOURCE_OS" = "darwin" ] && RESOURCE_OS="macos"
  AGENT_RESOURCE_TARGET="${E2E_AGENT_RESOURCE_TARGET:-agent-${RESOURCE_OS}-${AGENT_GOARCH}}"
  AGENT_RESOURCE_FILE="${E2E_AGENT_RESOURCE_FILE:-$AGENT_BIN}"
  AGENT_RESOURCE_FILENAME="$(basename "$AGENT_RESOURCE_FILE")"
  SINGBOX_RESOURCE_TARGET="${E2E_SINGBOX_RESOURCE_TARGET:-singbox-${RESOURCE_OS}-${AGENT_GOARCH}}"
  SINGBOX_RESOURCE_FILE="${E2E_SINGBOX_RESOURCE_FILE:-$SINGBOX_BIN}"
  SINGBOX_RESOURCE_VERSION="${E2E_SINGBOX_RESOURCE_VERSION:-${SINGBOX_VERSION:-1.14.0}}"
  SINGBOX_RESOURCE_FILENAME="$(basename "$SINGBOX_RESOURCE_FILE")"
  say "同步 Agent 资源（$AGENT_RESOURCE_TARGET）…"
  sync_dev_resource AGENT "$AGENT_RESOURCE_TARGET" "$AGENT_RESOURCE_FILE" "$E2E_RESOURCE_VERSION" "$AGENT_RESOURCE_FILENAME"
  say "同步 Sing-box 资源（$SINGBOX_RESOURCE_TARGET）…"
  sync_dev_resource SINGBOX "$SINGBOX_RESOURCE_TARGET" "$SINGBOX_RESOURCE_FILE" "$SINGBOX_RESOURCE_VERSION" "$SINGBOX_RESOURCE_FILENAME"
fi

MASTER_WS_URL="$(node -e 'const url = new URL("/ws/agent", process.argv[1]); url.protocol = url.protocol === "https:" ? "wss:" : "ws:"; console.log(url.toString())' "$SERVER_URL")"
say "启动 Agent（内核：$(basename "$SINGBOX_BIN")，日志：$LOG_DIR/agent.log）…"
(
  RIRICLOUD_NON_INTERACTIVE=1 \
  AGENT_TOKEN="$AGENT_TOKEN" \
    MASTER_WS_URL="$MASTER_WS_URL" \
    SINGBOX_BINARY_PATH="$SINGBOX_BIN" \
    SINGBOX_CONFIG_PATH="$SINGBOX_CONF_DIR/config.json" \
    "$AGENT_BIN" >"$LOG_DIR/agent.log" 2>&1
) &
AGENT_PID=$!

# 等待 Agent 鉴权与内核拉起（Windows 下首次运行内核可能被杀软拦截，已由退避重试兜底）
KERNEL_UP=0
for _ in $(seq 1 40); do
  if grep -q "sing-box started" "$LOG_DIR/agent.log" 2>/dev/null; then KERNEL_UP=1; break; fi
  kill -0 "$AGENT_PID" 2>/dev/null || break
  sleep 1
done

say "---------------- 就绪 ----------------"
say "Web 面板     ：$WEB_URL（admin@riricloud.local / RiriCloud-Admin-2026!）"
say "节点状态     ：面板「节点管理」页观察在线状态与遥测"
say "内核监听     ：$NODE_HOST:$NODE_PORT（config：$SINGBOX_CONF_DIR/config.json）"
if [ "$KERNEL_UP" = "1" ]; then
  say "内核状态     ：已拉起 ✔"
else
  say "内核状态     ：暂未拉起（继续重试中，详见 $LOG_DIR/agent.log）"
fi
say "跟踪 Agent 日志中，Ctrl+C 退出并回收 Agent 进程…"
say "--------------------------------------"

tail -n 30 -f "$LOG_DIR/agent.log"
