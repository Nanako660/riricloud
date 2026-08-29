#!/usr/bin/env bash
# 本地一键联调：主控端 + Web 面板 + Agent（真实 sing-box 内核）
#
# 用法（Git Bash / 任意 POSIX shell）：
#   bash scripts/dev-e2e.sh                  # 全套启动并跟踪 Agent 日志，Ctrl+C 退出
#   SKIP_WEB=1 bash scripts/dev-e2e.sh       # 不启动 Web 面板
#   NODE_PORT=9443 bash scripts/dev-e2e.sh   # 自定义内核监听端口（默认 8443）
#   AGENT_TOKEN=xxx bash scripts/dev-e2e.sh  # 复用既有节点 Token（跳过自动建节点）
#
# 环境变量：SERVER_URL / WEB_URL / ADMIN_EMAIL / ADMIN_PASSWORD / NODE_NAME / NODE_HOST / NODE_PORT
# sing-box 二进制查找顺序：SINGBOX_BINARY_PATH > .tools/sing-box/ > tools/ > PATH
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# 开发环境缓存/便携工具链（go、pnpm store），失败不致命（系统已装 go 时可直接用）
source scripts/dev-env.sh >/dev/null 2>&1 || true

SERVER_URL="${SERVER_URL:-http://localhost:3000}"
WEB_URL="${WEB_URL:-http://localhost:5173}"
ADMIN_EMAIL="${SEED_ADMIN_EMAIL:-admin@riricloud.local}"
ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:-riri-admin-demo}"
NODE_NAME="${NODE_NAME:-local-e2e}"
NODE_HOST="${NODE_HOST:-127.0.0.1}"
NODE_PORT="${NODE_PORT:-8443}"

LOG_DIR="$ROOT/.cache/logs"
SINGBOX_CONF_DIR="$ROOT/.cache/agent"
mkdir -p "$LOG_DIR" "$SINGBOX_CONF_DIR"

say() { printf '\033[1;36m[dev-e2e]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[dev-e2e]\033[0m %s\n' "$*" >&2; exit 1; }

# 从 stdin 的 JSON 提取顶层字段
jsonget() {
  node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const v=JSON.parse(d)[process.argv[1]];console.log(v==null?"":String(v))}catch{console.log("")}})' "$1"
}

server_up() { curl -fsS --max-time 2 "$SERVER_URL/api/v1/system/version" >/dev/null 2>&1; }
web_up() { curl -fsS --max-time 2 "$WEB_URL" >/dev/null 2>&1; }

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

# ---------- 1. sing-box 内核 ----------
SINGBOX_BIN="$(find_singbox)" || die "未找到 sing-box 内核：请放入 .tools/sing-box/ 或用 SINGBOX_BINARY_PATH 指定"
say "sing-box 内核：$SINGBOX_BIN"

# ---------- 2. 主控端（已在跑则复用） ----------
SERVER_PID=""
if server_up; then
  say "主控端已在 $SERVER_URL 运行，直接复用"
else
  if [ ! -f apps/server/prisma/dev.db ]; then
    say "初始化数据库（migrate deploy + seed）…"
    pnpm --filter @riricloud/server exec prisma migrate deploy
    pnpm --filter @riricloud/server exec prisma db seed
  fi
  say "启动主控端（日志：$LOG_DIR/server.log）…"
  pnpm dev:server >"$LOG_DIR/server.log" 2>&1 &
  SERVER_PID=$!
  for i in $(seq 1 60); do server_up && break; sleep 1; [ "$i" = 60 ] && die "主控端 60s 内未就绪，查看 $LOG_DIR/server.log"; done
  say "主控端就绪：$SERVER_URL"
fi

# ---------- 3. Web 面板（可选） ----------
WEB_PID=""
if [ "${SKIP_WEB:-0}" = "1" ]; then
  say "SKIP_WEB=1，跳过 Web 面板"
elif web_up; then
  say "Web 面板已在 $WEB_URL 运行，直接复用"
else
  say "启动 Web 面板（日志：$LOG_DIR/web.log）…"
  pnpm dev:web >"$LOG_DIR/web.log" 2>&1 &
  WEB_PID=$!
fi

# ---------- 4. 登录管理员并准备联调节点 ----------
LOGIN_BODY=$(printf '{"email":"%s","password":"%s"}' "$ADMIN_EMAIL" "$ADMIN_PASSWORD")
ADMIN_TOKEN="$(curl -fsS --max-time 5 -H 'Content-Type: application/json' -d "$LOGIN_BODY" "$SERVER_URL/api/v1/auth/login" | jsonget accessToken)"
[ -n "$ADMIN_TOKEN" ] || die "管理员登录失败：请检查 ADMIN_EMAIL/ADMIN_PASSWORD（默认 admin@riricloud.local / riri-admin-demo）"

AUTH=(-H "Authorization: Bearer $ADMIN_TOKEN")
AGENT_TOKEN="${AGENT_TOKEN:-}"
if [ -n "$AGENT_TOKEN" ]; then
  say "使用环境变量指定的 AGENT_TOKEN"
else
  # 按地址:端口查找联调节点（避免中文名经 Windows 控制台的编码问题）；已存在则对齐端口，不存在则创建
  NODE_LINE="$(curl -fsS --max-time 5 "${AUTH[@]}" "$SERVER_URL/api/v1/admin/nodes" \
    | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const n=(JSON.parse(d)||[]).find(x=>x.serverHost===process.argv[1]&&x.serverPort===Number(process.argv[2]));console.log(n?[n.id,n.agentToken,n.serverHost,n.serverPort].join(" "):"")}catch{console.log("")}})' "$NODE_HOST" "$NODE_PORT")"
  if [ -n "$NODE_LINE" ]; then
    read -r NODE_ID AGENT_TOKEN OLD_HOST OLD_PORT <<<"$NODE_LINE"
    say "复用既有节点（$OLD_HOST:$OLD_PORT）"
  else
    say "创建联调节点「$NODE_NAME」（$NODE_HOST:$NODE_PORT）…"
    CREATE_BODY=$(printf '{"name":"%s","serverHost":"%s","serverPort":%s}' "$NODE_NAME" "$NODE_HOST" "$NODE_PORT")
    AGENT_TOKEN="$(curl -fsS --max-time 5 -X POST "${AUTH[@]}" -H 'Content-Type: application/json' -d "$CREATE_BODY" "$SERVER_URL/api/v1/admin/nodes" | jsonget agentToken)"
    [ -n "$AGENT_TOKEN" ] || die "创建节点失败"
  fi
fi

# ---------- 5. 构建并启动 Agent ----------
say "构建 Agent…"
(cd apps/agent && go build -o riri-agent.exe .) || die "Agent 构建失败"

say "启动 Agent（内核：$(basename "$SINGBOX_BIN")，日志：$LOG_DIR/agent.log）…"
(
  cd apps/agent && AGENT_TOKEN="$AGENT_TOKEN" \
    MASTER_WS_URL="ws://localhost:3000/ws/agent" \
    SINGBOX_BINARY_PATH="$SINGBOX_BIN" \
    SINGBOX_CONFIG_PATH="$SINGBOX_CONF_DIR/config.json" \
    ./riri-agent.exe >"$LOG_DIR/agent.log" 2>&1
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
say "Web 面板     ：$WEB_URL（admin@riricloud.local / riri-admin-demo）"
say "节点状态     ：面板「节点管理」页观察在线状态与遥测"
say "内核监听     ：$NODE_HOST:$NODE_PORT（config：$SINGBOX_CONF_DIR/config.json）"
if [ "$KERNEL_UP" = "1" ]; then
  say "内核状态     ：已拉起 ✔"
else
  say "内核状态     ：暂未拉起（继续重试中，详见 $LOG_DIR/agent.log）"
fi
say "跟踪 Agent 日志中，Ctrl+C 退出并回收 Agent 进程…"
say "--------------------------------------"

cleanup() {
  kill "$AGENT_PID" 2>/dev/null || true
  # 只回收本次脚本启动的服务；已在运行的复用实例保持不动
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  [ -n "$WEB_PID" ] && kill "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

tail -n 30 -f "$LOG_DIR/agent.log"
