# syntax=docker/dockerfile:1

FROM golang:1.25-bookworm AS agent-build

ARG TARGETARCH=amd64
ARG RIRICLOUD_VERSION=dev
WORKDIR /src

COPY apps/agent/go.mod apps/agent/go.sum ./
RUN go mod download
COPY apps/agent/ ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH} go build -trimpath \
    -ldflags "-s -w -X main.Version=${RIRICLOUD_VERSION}" \
    -o /out/riri-agent .

FROM golang:1.26-bookworm AS singbox-build

ARG TARGETARCH=amd64
ARG SINGBOX_VERSION=1.14.0
ARG CRONET_VERSION=v150.0.7871.63-2
WORKDIR /src

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates curl tar \
	&& rm -rf /var/lib/apt/lists/* \
	&& case "${TARGETARCH}" in amd64|arm64) ;; *) echo "unsupported Docker architecture: ${TARGETARCH}" >&2; exit 1 ;; esac \
	&& curl --fail --silent --show-error --location \
	  "https://github.com/SagerNet/sing-box/archive/refs/tags/v${SINGBOX_VERSION}.tar.gz" \
	  --output sing-box.tar.gz \
	&& tar -xzf sing-box.tar.gz \
	&& curl --fail --silent --show-error --location \
	  "https://github.com/SagerNet/cronet-go/releases/download/${CRONET_VERSION}/libcronet-linux-${TARGETARCH}.so" \
	  --output /libcronet.so \
	&& chmod 0755 /libcronet.so

WORKDIR /src/sing-box-${SINGBOX_VERSION}
RUN CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH} go build -trimpath \
	-tags with_v2ray_api,with_utls,with_quic,with_naive_outbound,with_purego \
	-ldflags "-s -w" \
	-o /sing-box ./cmd/sing-box

FROM node:20-bookworm-slim AS build

WORKDIR /workspace
ENV COREPACK_HOME=/tmp/corepack

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

# Install dependencies before copying source so Docker can reuse the pnpm layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY apps/server/prisma/ apps/server/prisma/
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @riricloud/web build
RUN pnpm --filter @riricloud/server build
RUN pnpm --filter @riricloud/server deploy --prod /out/server \
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

FROM gcr.io/distroless/nodejs20-debian12 AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=file:/app/data/riri.db \
    MASTER_AGENT_ENABLED=true \
    MASTER_AGENT_BINARY_PATH=/usr/local/bin/riri-agent \
    SINGBOX_BINARY_PATH=/usr/local/bin/sing-box \
    MASTER_AGENT_CONFIG_PATH=/app/data/master-agent/config.json \
    RIRICLOUD_INSTALL_SCRIPT_PATH=/app/install-agent.sh

ARG RIRICLOUD_VERSION=dev
ARG RIRICLOUD_VCS_REF=unknown
ARG RIRICLOUD_BUILD_DATE=unknown
ARG RIRICLOUD_IMAGE_TAGS=latest
ARG SINGBOX_VERSION=1.14.0
LABEL org.opencontainers.image.title="RiriCloud Master" \
      org.opencontainers.image.description="RiriCloud control plane and web dashboard" \
      org.opencontainers.image.version="$RIRICLOUD_VERSION" \
      org.opencontainers.image.revision="$RIRICLOUD_VCS_REF" \
      org.opencontainers.image.created="$RIRICLOUD_BUILD_DATE" \
      org.opencontainers.image.licenses="GPL-3.0-only" \
      io.riricloud.singbox.version="$SINGBOX_VERSION" \
      io.riricloud.image.tags="$RIRICLOUD_IMAGE_TAGS"

COPY --from=build /out/server/ ./
COPY --from=build /workspace/apps/web/dist/ ./web-dist/
COPY --from=agent-build /out/riri-agent /usr/local/bin/riri-agent
COPY --from=singbox-build /sing-box /usr/local/bin/sing-box
COPY --from=singbox-build /libcronet.so /usr/local/bin/libcronet.so
COPY scripts/install-agent.sh ./install-agent.sh
COPY scripts/docker-entrypoint.js ./docker-entrypoint.js

USER 0

VOLUME ["/app/data"]
EXPOSE 3000 20000-29999/tcp 20000-29999/udp
ENTRYPOINT ["/nodejs/bin/node", "/app/docker-entrypoint.js"]
