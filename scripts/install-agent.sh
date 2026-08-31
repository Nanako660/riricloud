#!/bin/sh
# RiriCloud Agent installer. Run as root on a Linux VPS.
set -eu

umask 077

AGENT_TOKEN=""
MASTER_URL=""
MODE=""
INSTALL_ROOT="${RIRICLOUD_AGENT_DIR:-/opt/riri-agent}"
STATE_DIR="${RIRICLOUD_AGENT_DATA_DIR:-/var/lib/riri-agent}"
CONFIG_DIR="${RIRICLOUD_AGENT_CONFIG_DIR:-/etc/riri-agent}"
SERVICE_FILE="/etc/systemd/system/riri-agent.service"

die() {
  echo "riri-agent install failed: $*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: install-agent.sh --token TOKEN --master URL [--mode ws|http]

Options:
  --token TOKEN  AgentToken issued by the RiriCloud master
  --master URL   Master WS URL or HTTP(S) root URL
  --mode MODE    ws or http; defaults to the master URL scheme
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --token=*) AGENT_TOKEN=${1#*=} ;;
    --token)
      shift
      [ "$#" -gt 0 ] || die "--token requires a value"
      AGENT_TOKEN=$1
      ;;
    --master=*) MASTER_URL=${1#*=} ;;
    --master)
      shift
      [ "$#" -gt 0 ] || die "--master requires a value"
      MASTER_URL=$1
      ;;
    --mode=*) MODE=${1#*=} ;;
    --mode)
      shift
      [ "$#" -gt 0 ] || die "--mode requires a value"
      MODE=$1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *) die "unknown option: $1" ;;
  esac
  shift
done

[ "$(id -u)" -eq 0 ] || die "run this installer as root"
[ -n "$AGENT_TOKEN" ] || die "--token is required"
[ -n "$MASTER_URL" ] || die "--master is required"
command -v uname >/dev/null 2>&1 || die "uname is required"
command -v systemctl >/dev/null 2>&1 || die "systemd/systemctl is required"

case "$MASTER_URL" in
  ws://*)
    MASTER_SCHEME="ws"
    MASTER_REST=${MASTER_URL#ws://}
    ;;
  wss://*)
    MASTER_SCHEME="wss"
    MASTER_REST=${MASTER_URL#wss://}
    ;;
  http://*)
    MASTER_SCHEME="http"
    MASTER_REST=${MASTER_URL#http://}
    ;;
  https://*)
    MASTER_SCHEME="https"
    MASTER_REST=${MASTER_URL#https://}
    ;;
  *) die "--master must start with ws://, wss://, http://, or https://" ;;
esac

MASTER_AUTHORITY=${MASTER_REST%%/*}
[ -n "$MASTER_AUTHORITY" ] || die "--master must include a host"

case "$MODE" in
  "")
    case "$MASTER_SCHEME" in
      ws|wss) MODE="ws" ;;
      http|https) MODE="http" ;;
    esac
    ;;
  ws|http) ;;
  *) die "--mode must be ws or http" ;;
esac

case "${MASTER_SCHEME}:${MODE}" in
  ws:ws|wss:ws|http:http|https:http) ;;
  *)
    die "--mode ${MODE} is incompatible with --master scheme ${MASTER_SCHEME}"
    ;;
esac

case "$(uname -m)" in
  x86_64|amd64) PLATFORM="amd64" ;;
  aarch64|arm64) PLATFORM="arm64" ;;
  *) die "unsupported Linux architecture: $(uname -m); bundled targets are x86_64 and aarch64" ;;
esac

case "$MASTER_SCHEME" in
  ws) HTTP_SCHEME="http" ;;
  wss) HTTP_SCHEME="https" ;;
  http|https) HTTP_SCHEME="$MASTER_SCHEME" ;;
esac
DOWNLOAD_BASE="${HTTP_SCHEME}://${MASTER_AUTHORITY}/api/v1/downloads/binaries"

case "$MODE" in
  ws)
    case "$MASTER_SCHEME" in
      ws|wss) AGENT_MASTER_URL="${MASTER_SCHEME}://${MASTER_AUTHORITY}/ws/agent" ;;
      http) AGENT_MASTER_URL="ws://${MASTER_AUTHORITY}/ws/agent" ;;
      https) AGENT_MASTER_URL="wss://${MASTER_AUTHORITY}/ws/agent" ;;
    esac
    ;;
  http) AGENT_MASTER_URL="${HTTP_SCHEME}://${MASTER_AUTHORITY}" ;;
esac

download_asset() {
  target=$1
  destination=$2
  temporary="${destination}.tmp.$$"
  rm -f "$temporary"
  if command -v curl >/dev/null 2>&1; then
    curl --fail --silent --show-error --location --retry 3 \
      --header "x-agent-token: ${AGENT_TOKEN}" \
      "${DOWNLOAD_BASE}/${target}" --output "$temporary"
  elif command -v wget >/dev/null 2>&1; then
    wget --quiet --tries=3 --header="x-agent-token: ${AGENT_TOKEN}" \
      "${DOWNLOAD_BASE}/${target}" -O "$temporary"
  else
    die "curl or wget is required"
  fi
  [ -s "$temporary" ] || die "downloaded asset is empty: ${target}"
  mv "$temporary" "$destination"
  chmod 0755 "$destination"
}

mkdir -p "$INSTALL_ROOT" "$STATE_DIR" "$CONFIG_DIR"
download_asset "agent-linux-${PLATFORM}" "$INSTALL_ROOT/riri-agent"
download_asset "singbox-linux-${PLATFORM}" "$INSTALL_ROOT/sing-box"

cat > "$CONFIG_DIR/agent.env" <<EOF
AGENT_TOKEN=${AGENT_TOKEN}
MASTER_URL=${AGENT_MASTER_URL}
AGENT_MODE=${MODE}
POLL_INTERVAL_SECS=${POLL_INTERVAL_SECS:-15}
SINGBOX_CONFIG_PATH=${STATE_DIR}/config.json
SINGBOX_BINARY_PATH=${INSTALL_ROOT}/sing-box
EOF
chmod 0600 "$CONFIG_DIR/agent.env"

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=RiriCloud Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=${CONFIG_DIR}/agent.env
WorkingDirectory=${STATE_DIR}
ExecStart=${INSTALL_ROOT}/riri-agent
Restart=always
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF
chmod 0644 "$SERVICE_FILE"

systemctl daemon-reload
systemctl enable --now riri-agent.service

echo "riri-agent installed: mode=${MODE}, platform=linux-${PLATFORM}"
echo "master=${AGENT_MASTER_URL}"
