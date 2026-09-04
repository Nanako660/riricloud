# syntax=docker/dockerfile:1

FROM golang:1.25-bookworm AS agent-build

ARG TARGETARCH=amd64
ARG RIRICLOUD_VERSION=dev
WORKDIR /src

COPY apps/agent/go.mod apps/agent/go.sum ./
RUN --mount=type=cache,id=riricloud-go-mod,target=/go/pkg/mod,sharing=locked \
    go mod download
COPY apps/agent/ ./
RUN --mount=type=cache,id=riricloud-go-mod,target=/go/pkg/mod,sharing=locked \
    --mount=type=cache,id=riricloud-go-build,target=/root/.cache/go-build,sharing=locked \
    CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH} go build -gcflags "main=-N -l" -trimpath \
    -ldflags "-s -w -X main.Version=${RIRICLOUD_VERSION}" \
    -o /out/riri-agent .

FROM golang:1.26-bookworm AS singbox-build

ARG TARGETARCH=amd64
ARG RIRICLOUD_VERSION=dev
ARG SINGBOX_VERSION=1.14.0
ARG CRONET_VERSION=v150.0.7871.63-2
WORKDIR /src

RUN --mount=type=cache,id=riricloud-singbox-downloads,target=/tmp/singbox-cache,sharing=locked \
    apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates curl tar \
	&& rm -rf /var/lib/apt/lists/* \
	&& case "${TARGETARCH}" in amd64|arm64) ;; *) echo "unsupported Docker architecture: ${TARGETARCH}" >&2; exit 1 ;; esac \
	&& singbox_archive="/tmp/singbox-cache/sing-box-${SINGBOX_VERSION}.tar.gz" \
	&& cronet_library="/tmp/singbox-cache/libcronet-linux-${TARGETARCH}-${CRONET_VERSION}.so" \
	&& if [ ! -s "$singbox_archive" ]; then curl --fail --silent --show-error --location \
	  "https://github.com/SagerNet/sing-box/archive/refs/tags/v${SINGBOX_VERSION}.tar.gz" \
	  --output "${singbox_archive}.tmp" && mv "${singbox_archive}.tmp" "$singbox_archive"; fi \
	&& if [ ! -s "$cronet_library" ]; then curl --fail --silent --show-error --location \
	  "https://github.com/SagerNet/cronet-go/releases/download/${CRONET_VERSION}/libcronet-linux-${TARGETARCH}.so" \
	  --output "${cronet_library}.tmp" && mv "${cronet_library}.tmp" "$cronet_library"; fi \
	&& tar -xzf "$singbox_archive" \
	&& cp "$cronet_library" /libcronet.so \
	&& chmod 0755 /libcronet.so

WORKDIR /src/sing-box-${SINGBOX_VERSION}
RUN --mount=type=cache,id=riricloud-go-mod,target=/go/pkg/mod,sharing=locked \
	--mount=type=cache,id=riricloud-go-build,target=/root/.cache/go-build,sharing=locked \
	CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH} go build -trimpath \
	-tags with_v2ray_api,with_utls,with_quic,with_naive_outbound,with_purego \
	-ldflags "-s -w" \
	-o /sing-box ./cmd/sing-box

FROM node:20-bookworm-slim AS build

WORKDIR /workspace
ENV COREPACK_HOME=/tmp/corepack
ARG TARGETARCH=amd64
ARG RIRICLOUD_VERSION=dev
ARG SINGBOX_VERSION=1.14.0
ARG SINGBOX_REVISION=1
ARG CRONET_VERSION=v150.0.7871.63-2

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

# Install dependencies before copying source so Docker can reuse the pnpm layer.
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY apps/server/prisma/ apps/server/prisma/
COPY apps/web/package.json apps/web/package.json
RUN --mount=type=cache,id=riricloud-corepack,target=/tmp/corepack,sharing=locked \
    --mount=type=cache,id=riricloud-pnpm,target=/workspace/.cache/pnpm,sharing=locked \
    pnpm install --frozen-lockfile

COPY . .
RUN --mount=type=cache,id=riricloud-corepack,target=/tmp/corepack,sharing=locked \
    pnpm --filter @riricloud/web build
RUN --mount=type=cache,id=riricloud-corepack,target=/tmp/corepack,sharing=locked \
    pnpm --filter @riricloud/server build \
    && mkdir -p /tmp/server-dist \
    && cp -a apps/server/dist/. /tmp/server-dist/
RUN --mount=type=cache,id=riricloud-corepack,target=/tmp/corepack,sharing=locked \
    --mount=type=cache,id=riricloud-pnpm,target=/workspace/.cache/pnpm,sharing=locked \
    pnpm --filter @riricloud/server deploy --prod /out/server \
    && mkdir -p /out/server/dist \
    && cp -a /tmp/server-dist/. /out/server/dist/ \
    && if [ ! -f /out/server/dist/main.js ] && [ ! -f /out/server/dist/src/main.js ]; then \
      echo "server build output missing from /out/server/dist" >&2; \
      exit 1; \
    fi \
    && cd /out/server \
    && DATABASE_URL=file:/tmp/riri-build.db node node_modules/prisma/build/index.js generate \
    && rm -f /tmp/riri-build.db \
    && rm -rf src tsconfig.json tsconfig.build.json nest-cli.json node_modules/.pnpm/node_modules \
    && rm -rf node_modules/typescript node_modules/@types/node \
    && rm -rf node_modules/.pnpm/typescript@* node_modules/.pnpm/@types+node@* \
    && find node_modules -type f \( -name '*.d.ts' -o -name '*.d.mts' -o -name '*.d.cts' -o -name '*.map' \) -delete \
    && find node_modules -type f \( -path '*/@prisma/client/runtime/query_compiler_bg.*' \
      -o -path '*/@prisma/client/runtime/query_engine_bg.*' \
      -o -path '*/@prisma/client/runtime/wasm-compiler-edge.*' \
      -o -path '*/@prisma/client/runtime/wasm-engine-edge.*' \
      -o -path '*/.prisma/client/query_engine_bg.*' \
      -o -path '*/node_modules/prisma/build/query_compiler_bg.*' \
      -o -path '*/node_modules/prisma/build/query_engine_bg.*' \) -delete \
    && find node_modules -type d \( -path '*/node_modules/prisma/build/public' \
      -o -path '*/node_modules/prisma/prisma-client' \) -prune -exec rm -rf {} + \
    && find /out/server -type f \( -name '*.map' -o -name '*.tsbuildinfo' \) -delete

# 将应用版本与可分发的 Sing-box 资源版本分开登记，文件哈希写入运行时 manifest。
COPY --from=agent-build /out/riri-agent /tmp/riri-agent
COPY --from=singbox-build /sing-box /tmp/sing-box
COPY --from=singbox-build /libcronet.so /tmp/libcronet.so
RUN mkdir -p \
      /out/binaries/agent-linux-${TARGETARCH} \
      /out/binaries/singbox/${SINGBOX_VERSION}-r${SINGBOX_REVISION}/linux-${TARGETARCH} \
    && cp /tmp/riri-agent /out/binaries/agent-linux-${TARGETARCH}/riri-agent \
    && cp /tmp/sing-box /out/binaries/singbox/${SINGBOX_VERSION}-r${SINGBOX_REVISION}/linux-${TARGETARCH}/sing-box \
    && cp /tmp/libcronet.so /out/binaries/singbox/${SINGBOX_VERSION}-r${SINGBOX_REVISION}/linux-${TARGETARCH}/libcronet.so \
    && cp /tmp/riri-agent /out/binaries/agent-linux-${TARGETARCH} \
    && cp /tmp/sing-box /out/binaries/singbox-linux-${TARGETARCH} \
    && cp /tmp/libcronet.so /out/binaries/libcronet.so \
    && chmod +x /out/binaries/agent-linux-${TARGETARCH}/riri-agent /out/binaries/agent-linux-${TARGETARCH} /out/binaries/singbox/${SINGBOX_VERSION}-r${SINGBOX_REVISION}/linux-${TARGETARCH}/sing-box /out/binaries/singbox-linux-${TARGETARCH}
# 使用 Dockerfile heredoc 保持 manifest 生成脚本为单条 RUN 指令。
RUN node - /out/binaries "$RIRICLOUD_VERSION" "$SINGBOX_VERSION" "$SINGBOX_REVISION" "$TARGETARCH" "$CRONET_VERSION" <<'NODE'
  const fs = require("fs");
  const path = require("path");
  const crypto = require("crypto");
  const [root, appVersion, singboxVersion, revision, arch, cronetVersion] = process.argv.slice(2);
  const info = (name, role, file) => { const body = fs.readFileSync(file); return { name, role, path: path.relative(root, file).split(path.sep).join("/"), sha256: crypto.createHash("sha256").update(body).digest("hex"), size: body.length }; };
  const platform = `linux-${arch}`;
  const singboxDir = path.join(root, "singbox", `${singboxVersion}-r${revision}`, platform);
  const resources = [
    { kind: "AGENT", upstreamVersion: appVersion, revision: 1, source: "BUILTIN", status: "ACTIVE", builtFromAppVersion: appVersion, isDefault: true, assets: [{ target: `agent-${platform}`, os: "linux", arch, files: [info("riri-agent", "main", path.join(root, `agent-${platform}`, "riri-agent"))] }] },
    { kind: "SINGBOX", upstreamVersion: singboxVersion, revision: Number(revision), source: "BUILTIN", status: "ACTIVE", isDefault: true, cronetVersion, assets: [{ target: `singbox-${platform}`, os: "linux", arch, files: [info("sing-box", "main", path.join(singboxDir, "sing-box")), info("libcronet.so", "auxiliary", path.join(singboxDir, "libcronet.so"))] }] }
  ];
  fs.writeFileSync(path.join(root, "manifest.json"), `${JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), applicationVersion: appVersion, resources }, null, 2)}\n`);
NODE

FROM gcr.io/distroless/nodejs20-debian12 AS runtime

ARG TARGETARCH=amd64

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=file:/app/data/riri.db \
    MASTER_AGENT_ENABLED=true \
    MASTER_AGENT_BINARY_PATH=/usr/local/bin/riri-agent \
    SINGBOX_BINARY_PATH=/usr/local/bin/sing-box \
    MASTER_AGENT_CONFIG_PATH=/app/data/master-agent/config.json

ARG RIRICLOUD_VERSION=dev
ARG RIRICLOUD_VCS_REF=unknown
ARG RIRICLOUD_BUILD_DATE=unknown
ARG RIRICLOUD_IMAGE_TAGS=latest
ARG SINGBOX_VERSION=1.14.0
ARG SINGBOX_REVISION=1
ARG CRONET_VERSION=v150.0.7871.63-2
LABEL org.opencontainers.image.title="RiriCloud Master" \
      org.opencontainers.image.description="RiriCloud control plane and web dashboard" \
      org.opencontainers.image.version="$RIRICLOUD_VERSION" \
      org.opencontainers.image.revision="$RIRICLOUD_VCS_REF" \
      org.opencontainers.image.created="$RIRICLOUD_BUILD_DATE" \
      org.opencontainers.image.licenses="GPL-3.0-only" \
      io.riricloud.singbox.version="$SINGBOX_VERSION" \
      io.riricloud.singbox.revision="$SINGBOX_REVISION" \
      io.riricloud.cronet.version="$CRONET_VERSION" \
      io.riricloud.image.tags="$RIRICLOUD_IMAGE_TAGS"

COPY --from=build /out/server/ ./
COPY --from=build /workspace/apps/web/dist/ ./web-dist/
COPY --from=build /out/binaries/ ./binaries/
COPY --from=agent-build /out/riri-agent /usr/local/bin/riri-agent
COPY --from=singbox-build /sing-box /usr/local/bin/sing-box
COPY --from=singbox-build /libcronet.so /usr/local/bin/libcronet.so
COPY scripts/docker-entrypoint.js ./docker-entrypoint.js

USER 0

VOLUME ["/app/data"]
EXPOSE 3000 20000-29999/tcp 20000-29999/udp
ENTRYPOINT ["/nodejs/bin/node", "/app/docker-entrypoint.js"]
