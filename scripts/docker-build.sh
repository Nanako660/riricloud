#!/usr/bin/env bash
# 构建、标记、导出并运行 RiriCloud Docker 镜像。
set -euo pipefail

RIRI_ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$RIRI_ROOT"

COMMAND="${1:-build}"

case "$COMMAND" in
  build|export|up|down|tags) ;;
  *)
    echo "用法：$0 {build|export|up|down|tags} [docker compose options]" >&2
    exit 2
    ;;
esac

die() {
  echo "Docker 操作失败：$*" >&2
  exit 1
}

require_linux_docker_environment() {
  local shell_name
  local docker_os

  shell_name="$(uname -s 2>/dev/null || true)"
  [ "$shell_name" = "Linux" ] || die "Docker 构建、导出与 Compose 操作只能在 Linux/WSL shell 中执行；Windows PowerShell/Git Bash 请从 WSL 调用"
  command -v docker >/dev/null 2>&1 || die "缺少 docker，请确认 WSL 已启用 Docker Desktop 集成"
  docker_os="$(docker info --format '{{.OSType}}' 2>/dev/null || true)"
  [ "$docker_os" = "linux" ] || die "Docker daemon 必须运行在 Linux containers 模式，当前为：${docker_os:-unavailable}"
}

case "$COMMAND" in
  build|export|up|down)
    require_linux_docker_environment
    ;;
esac

if command -v node >/dev/null 2>&1; then
  NODE_BIN="node"
elif command -v node.exe >/dev/null 2>&1; then
  NODE_BIN="node.exe"
else
  die "node is required"
fi

VERSION="$($NODE_BIN -p "require('./package.json').version")"
IMAGE_VERSION="${RIRICLOUD_VERSION:-$VERSION}"
IMAGE_VERSION="${IMAGE_VERSION#v}"

case "$IMAGE_VERSION" in
  ''|*[!A-Za-z0-9_.-]*) die "RIRICLOUD_VERSION 不是合法的 Docker tag：$IMAGE_VERSION" ;;
esac

MASTER_REPOSITORY="${MASTER_IMAGE_REPOSITORY:-riricloud/master}"
AGENT_REPOSITORY="${AGENT_IMAGE_REPOSITORY:-riricloud/agent}"
MASTER_VERSION_IMAGE="${MASTER_IMAGE:-${MASTER_REPOSITORY}:${IMAGE_VERSION}}"
AGENT_VERSION_IMAGE="${AGENT_IMAGE:-${AGENT_REPOSITORY}:${IMAGE_VERSION}}"
MASTER_LATEST_IMAGE="${MASTER_LATEST_IMAGE:-${MASTER_REPOSITORY}:latest}"
AGENT_LATEST_IMAGE="${AGENT_LATEST_IMAGE:-${AGENT_REPOSITORY}:latest}"
SINGBOX_VERSION="${SINGBOX_VERSION:-1.14.0}"
SINGBOX_REVISION="${SINGBOX_REVISION:-1}"
CRONET_VERSION="${CRONET_VERSION:-v150.0.7871.63-2}"
ARTIFACT_ROOT="${RIRICLOUD_ARTIFACT_DIR:-$RIRI_ROOT/artifacts}"

if [ -n "${DOCKER_PLATFORM:-}" ]; then
  DOCKER_PLATFORM_VALUE="$DOCKER_PLATFORM"
elif [ "$COMMAND" = "build" ] || [ "$COMMAND" = "export" ]; then
  DOCKER_PLATFORM_VALUE="$(docker info --format '{{.OSType}}/{{.Architecture}}')"
else
  # tags/up/down 不需要解析 Docker daemon 平台；构建/导出时会在上方强制校验。
  DOCKER_PLATFORM_VALUE="${RIRICLOUD_DOCKER_PLATFORM:-linux/amd64}"
fi

platform_filename() {
  local platform="$1"
  local os="${platform%%/*}"
  local arch="${platform#*/}"
  arch="${arch%%/*}"
  case "$arch" in
    x86_64|amd64) arch="amd64" ;;
    aarch64|arm64) arch="arm64" ;;
    armv7|arm) arch="armv7" ;;
  esac
  printf '%s_%s\n' "$os" "$arch"
}

PLATFORM_NAME="$(platform_filename "$DOCKER_PLATFORM_VALUE")"
PLATFORM_DIR="${PLATFORM_NAME//_/-}"
NORMALIZED_PLATFORM="${PLATFORM_NAME//_//}"
VCS_REF="${RIRICLOUD_VCS_REF:-$(git rev-parse HEAD 2>/dev/null || printf 'unknown')}"
BUILD_DATE="${RIRICLOUD_BUILD_DATE:-$(date -u '+%Y-%m-%dT%H:%M:%SZ')}"

platform_args=()
if [ -n "${DOCKER_PLATFORM:-}" ]; then
  platform_args+=(--platform "$DOCKER_PLATFORM")
fi

common_build_args=(
  --build-arg "RIRICLOUD_VERSION=$IMAGE_VERSION"
  --build-arg "RIRICLOUD_VCS_REF=$VCS_REF"
  --build-arg "RIRICLOUD_BUILD_DATE=$BUILD_DATE"
  --build-arg "RIRICLOUD_IMAGE_TAGS=$IMAGE_VERSION,latest"
)

build_images() {
  echo "构建 Master 镜像：$MASTER_VERSION_IMAGE、$MASTER_LATEST_IMAGE"
  docker build "${platform_args[@]}" \
    "${common_build_args[@]}" \
    --build-arg "SINGBOX_VERSION=$SINGBOX_VERSION" \
    --build-arg "SINGBOX_REVISION=$SINGBOX_REVISION" \
    --build-arg "CRONET_VERSION=$CRONET_VERSION" \
    --tag "$MASTER_VERSION_IMAGE" \
    --tag "$MASTER_LATEST_IMAGE" \
    --file Dockerfile .

  echo "构建 Agent 镜像：$AGENT_VERSION_IMAGE、$AGENT_LATEST_IMAGE"
  docker build "${platform_args[@]}" \
    "${common_build_args[@]}" \
    --build-arg "SINGBOX_VERSION=$SINGBOX_VERSION" \
    --build-arg "SINGBOX_REVISION=$SINGBOX_REVISION" \
    --build-arg "CRONET_VERSION=$CRONET_VERSION" \
    --tag "$AGENT_VERSION_IMAGE" \
    --tag "$AGENT_LATEST_IMAGE" \
    --file Dockerfile.agent .
}

require_image_tags() {
  local image
  for image in "$MASTER_VERSION_IMAGE" "$MASTER_LATEST_IMAGE" "$AGENT_VERSION_IMAGE" "$AGENT_LATEST_IMAGE"; do
    docker image inspect "$image" >/dev/null 2>&1 || die "找不到镜像：$image，请先执行 pnpm docker:build"
  done
}

image_label() {
  local image="$1"
  local key="$2"
  local value
  value="$(docker image inspect "$image" --format "{{index .Config.Labels \"$key\"}}" 2>/dev/null || true)"
  [ "$value" = "<no value>" ] && value=""
  printf '%s' "$value"
}

export_images() {
  require_image_tags

  local output_dir="${DOCKER_EXPORT_DIR:-$ARTIFACT_ROOT/docker/${PLATFORM_DIR}}"
  mkdir -p "$output_dir"
  EXPORT_DIR="$output_dir"

  local master_archive="$EXPORT_DIR/riricloud-master_${IMAGE_VERSION}_${PLATFORM_NAME}.tar.gz"
  local agent_archive="$EXPORT_DIR/riricloud-agent_${IMAGE_VERSION}_${PLATFORM_NAME}.tar.gz"
  local checksum_file="$EXPORT_DIR/riricloud-docker-images_${IMAGE_VERSION}_${PLATFORM_NAME}.sha256"
  local manifest_file="$EXPORT_DIR/riricloud-docker-images_${IMAGE_VERSION}_${PLATFORM_NAME}.manifest.json"
  local master_label_version="$(image_label "$MASTER_VERSION_IMAGE" "org.opencontainers.image.version")"
  local master_label_revision="$(image_label "$MASTER_VERSION_IMAGE" "org.opencontainers.image.revision")"
  local master_label_created="$(image_label "$MASTER_VERSION_IMAGE" "org.opencontainers.image.created")"
  local master_label_tags="$(image_label "$MASTER_VERSION_IMAGE" "io.riricloud.image.tags")"
  local agent_label_version="$(image_label "$AGENT_VERSION_IMAGE" "org.opencontainers.image.version")"
  local agent_label_revision="$(image_label "$AGENT_VERSION_IMAGE" "org.opencontainers.image.revision")"
  local agent_label_created="$(image_label "$AGENT_VERSION_IMAGE" "org.opencontainers.image.created")"
  local agent_label_tags="$(image_label "$AGENT_VERSION_IMAGE" "io.riricloud.image.tags")"
  local agent_singbox_version="$(image_label "$AGENT_VERSION_IMAGE" "io.riricloud.singbox.version")"

  echo "导出 Master 镜像：$master_archive"
  docker save "$MASTER_VERSION_IMAGE" "$MASTER_LATEST_IMAGE" | gzip -n -c > "$master_archive"
  echo "导出 Agent 镜像：$agent_archive"
  docker save "$AGENT_VERSION_IMAGE" "$AGENT_LATEST_IMAGE" | gzip -n -c > "$agent_archive"

  (
    cd "$EXPORT_DIR"
    sha256sum "$(basename "$master_archive")" "$(basename "$agent_archive")" > "$checksum_file"
  )

  local master_digest
  local agent_digest
  master_digest="$(sha256sum "$master_archive" | awk '{print $1}')"
  agent_digest="$(sha256sum "$agent_archive" | awk '{print $1}')"
  local manifest_node_path="$manifest_file"
  if [ "$NODE_BIN" = "node.exe" ] && command -v wslpath >/dev/null 2>&1; then
    manifest_node_path="$(wslpath -w "$manifest_file")"
  fi

  "$NODE_BIN" -e '
    const fs = require("fs");
    const [manifestPath, version, platform, masterVersion, masterLatest, agentVersion, agentLatest,
      masterArchive, agentArchive, masterSha256, agentSha256, singboxVersion, singboxRevision, cronetVersion,
      masterLabelVersion, masterLabelRevision, masterLabelCreated, masterLabelTags,
      agentLabelVersion, agentLabelRevision, agentLabelCreated, agentLabelTags, created] = process.argv.slice(1);
    const manifest = {
      schemaVersion: 1,
      product: "RiriCloud",
      version,
      platform,
      generatedAt: created,
      images: [
        {
          component: "master",
          tags: [masterVersion, masterLatest],
          archive: masterArchive,
          sha256: masterSha256,
          labels: {
            "org.opencontainers.image.title": "RiriCloud Master",
            "org.opencontainers.image.version": masterLabelVersion || version,
            "org.opencontainers.image.revision": masterLabelRevision || "unknown",
            "org.opencontainers.image.created": masterLabelCreated || "unknown",
            "io.riricloud.image.tags": masterLabelTags || `${masterVersion},${masterLatest}`
          }
        },
        {
          component: "agent",
          tags: [agentVersion, agentLatest],
          archive: agentArchive,
          sha256: agentSha256,
          singboxVersion,
          singboxRevision,
          cronetVersion,
          labels: {
            "org.opencontainers.image.title": "RiriCloud Agent",
            "org.opencontainers.image.version": agentLabelVersion || version,
            "org.opencontainers.image.revision": agentLabelRevision || "unknown",
            "org.opencontainers.image.created": agentLabelCreated || "unknown",
            "io.riricloud.image.tags": agentLabelTags || `${agentVersion},${agentLatest}`
          }
        }
      ]
    };
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  ' "$manifest_node_path" "$IMAGE_VERSION" "$NORMALIZED_PLATFORM" \
    "$MASTER_VERSION_IMAGE" "$MASTER_LATEST_IMAGE" "$AGENT_VERSION_IMAGE" "$AGENT_LATEST_IMAGE" \
    "$(basename "$master_archive")" "$(basename "$agent_archive")" "$master_digest" "$agent_digest" \
    "${agent_singbox_version:-$SINGBOX_VERSION}" "$(image_label "$AGENT_VERSION_IMAGE" "io.riricloud.singbox.revision")" "$(image_label "$AGENT_VERSION_IMAGE" "io.riricloud.cronet.version")" \
    "$master_label_version" "$master_label_revision" "$master_label_created" "$master_label_tags" \
    "$agent_label_version" "$agent_label_revision" "$agent_label_created" "$agent_label_tags" "$BUILD_DATE"

  echo "镜像导出完成：$EXPORT_DIR"
  echo "版本清单：$manifest_file"
  echo "校验文件：$checksum_file"
}

compose() {
  RIRICLOUD_VERSION="$IMAGE_VERSION" \
  RIRICLOUD_VCS_REF="$VCS_REF" \
  RIRICLOUD_BUILD_DATE="$BUILD_DATE" \
  RIRICLOUD_IMAGE_TAGS="$IMAGE_VERSION,latest" \
  MASTER_IMAGE="$MASTER_LATEST_IMAGE" \
  AGENT_IMAGE="$AGENT_LATEST_IMAGE" \
  docker compose "$@"
}

case "$COMMAND" in
  build)
    build_images
    case "${DOCKER_EXPORT:-true}" in
      true|TRUE|1|yes|YES|on|ON) export_images ;;
      false|FALSE|0|no|NO|off|OFF) echo "已跳过镜像导出（DOCKER_EXPORT=$DOCKER_EXPORT）" ;;
      *) die "DOCKER_EXPORT must be true or false" ;;
    esac
    ;;
  export)
    export_images
    ;;
  up)
    shift
    compose up -d --build "$@"
    ;;
  down)
    shift
    docker compose down --remove-orphans "$@"
    ;;
  tags)
    printf '%s\n' "$MASTER_VERSION_IMAGE" "$MASTER_LATEST_IMAGE" "$AGENT_VERSION_IMAGE" "$AGENT_LATEST_IMAGE"
    ;;
  *)
    die "未知 Docker 操作：$COMMAND"
    ;;
esac
