#!/bin/sh
# 兼容旧入口：实际逻辑统一由无 shell 的 Distroless Node 入口执行。
set -eu
exec /nodejs/bin/node /app/docker-entrypoint.js
