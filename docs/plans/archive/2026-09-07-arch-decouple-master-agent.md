---
title: "arch-decouple-master-agent"
type: plan
status: completed
target_version: v0.6.15
created_at: "2026-09-07"
author: "Antigravity & Maintainers"
archived_at: "2026-09-07"
---
# Master 与 Agent 架构解耦与独立版本管理规划

## 🎯 目标与背景

本阶段旨在彻底解耦 Master 与 Agent 的架构依赖：
1. **版本治理分离**：Agent 建立独立版本管理体系（`apps/agent/VERSION`、`apps/agent/CHANGELOG.md`、`agent-vA.B.C` Git Tag、`pnpm bump:agent`）；Master 沿用根 `package.json`（`vX.Y.Z`）。两者分别维护各自的 `[Unreleased]` 缓冲区。
2. **Master Docker 容器瘦身与 Agent 容器分离**：Master 镜像内不再子进程托管 Agent，运行时环境移除 `/usr/local/bin/riri-agent`；但构建期仍编译当前平台 Agent 并注入 `/app/binaries/`，保障离线私有环境的直连下载分发能力。
3. **Docker Compose 默认协同编排**：Compose 默认同时拉起 `master` 与 `agent`（Master-Local）两个独立容器；通过 `.env` 注入 `AGENT_IMAGE` 与 `MASTER_LOCAL_AGENT_TOKEN`。
4. **Master-Local 节点与管理端协同**：Master 启动时 bootstrap 检测到 `MASTER_LOCAL_AGENT_TOKEN` 自动绑定该 Token；Master 服务端感知 `AGENT_IMAGE` 并在管理面板展示推荐 Agent 镜像与命令。
5. **自包含包与发布脚本解耦**：`bundle-master.sh` 与 `start.sh` 移除内置 Agent 进程托管；`release.sh` 支持 `--agent` 与 `--master` 参数化发布。

---

## 📋 里程碑与任务清单

### 里程碑 1：独立版本管理体系与门禁治理
- [x] 任务 1.1: 创建 `apps/agent/VERSION`（初始 `0.6.14`）与 `apps/agent/CHANGELOG.md`
- [x] 任务 1.2: 改造 `scripts/version-governance.mjs`，支持 `bump-agent` 与双 CHANGELOG 路径敏感校验
- [x] 任务 1.3: 改造 `package.json` 注册 `bump:agent` 命令，改造 `scripts/build-agent.sh` 优先读取 `apps/agent/VERSION`

### 里程碑 2：Master 容器、Master-Local Bootstrap 与 Docker Compose 编排
- [x] 任务 2.1: 改造 `apps/server/prisma/master-agent-bootstrap.js`，支持 `MASTER_LOCAL_AGENT_TOKEN` 环境变量绑定
- [x] 任务 2.2: 改造 `scripts/docker-entrypoint.js`，移除内置 Agent 子进程托管与生命周期联锁
- [x] 任务 2.3: 改造 `Dockerfile`，移除 runtime 阶段的 Agent 二进制与环境变量，保留构建期注入 `/out/binaries/` 的静态下载分发资产
- [x] 任务 2.4: 改造 `docker-compose.yml` 与 `docker-compose.image.yml`，默认编排 master 与 agent 服务，注入 `AGENT_IMAGE` 与 `MASTER_LOCAL_AGENT_TOKEN`
- [x] 任务 2.5: 改造 `scripts/docker-build.sh`，支持 Master 与 Agent 各自版本号打标、构建与导出

### 里程碑 3：自包含发行包与服务端/前端展示
- [x] 任务 3.1: 改造 `scripts/master-bundle/start.sh` 与 `scripts/bundle-master.sh`，移除内置 Agent 托管
- [x] 任务 3.2: 改造 `apps/server/src/system` 与管理端节点界面，展示配置注入的 `AGENT_IMAGE` 与快捷命令

### 里程碑 4：自动化发布脚本与质量门禁
- [x] 任务 4.1: 改造 `scripts/release.sh`，支持 `--master` 与 `--agent` 独立发布流水线
- [x] 任务 4.2: 更新相关文档（`docs/VERSIONING.md`、`docs/DEPLOYMENT_GUIDE.md`、`docs/ARCHITECTURE.md`、`docs/API_AND_PROTOCOLS.md`）
- [x] 任务 4.3: 登记主 `CHANGELOG.md` 与 `apps/agent/CHANGELOG.md` 的 `[Unreleased]`，通过五合一全量门禁 `pnpm gate`
- [x] 任务 4.4: 归档规划文档 `pnpm plan:archive`

---

## 🧪 验收标准与测试记录

- [x] `pnpm gate:version` 成功校验 Master 与 Agent 的独立版本号与 CHANGELOG
- [x] `pnpm gate:docs` 校验通过
- [x] `pnpm gate:server` 校验通过（单测与类型检查）
- [x] `pnpm gate:web` 校验通过
- [x] `pnpm gate:agent` 校验通过
- [x] `pnpm gate` 五合一全绿
