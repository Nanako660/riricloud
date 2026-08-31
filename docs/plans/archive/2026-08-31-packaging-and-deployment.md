---
title: "部署打包实施方案（Release 二进制分发 + 本地 Docker 分发）"
type: plan
status: completed
target_version: v0.4.0
created_at: "2026-08-31"
author: "Antigravity & Maintainers"
archived_at: "2026-08-31"
---
# 部署打包实施方案（Release 二进制分发 + 本地 Docker 分发）

## 🎯 目标与背景

本阶段目标为落地 RiriCloud 的标准化部署打包体系与节点一键接入能力，包含：
1. **二进制 Release 发布分发**：自动化构建并发布主控端自包含包（Node 依赖 + Web 面板 + 静态资源 + 内置 Agent 二进制）与 Agent 多平台二进制；增强启动脚本 `start.sh` 支持自动迁移与 `AUTO_SEED` 幂等数据播种。
2. **主控一键安装服务 (`install.sh`)**：服务端提供 `GET /api/v1/install.sh` 公开路由与 `scripts/install-agent.sh` 脚本，支持参数注入、自动检测 VPS 架构并从主控直连下载 Agent 与 Sing-box 资产注册 systemd。
3. **本地 Docker 分发与编排**：提供主控端多阶段构建 `Dockerfile`（支持 `/app/data` 挂载与自动迁移/播种）与节点端 `Dockerfile.agent`（内置 `riri-agent` 与 `sing-box`，支持 `--network host`）；根目录提供 `docker-compose.yml` 与本地辅助构建脚本 `scripts/docker-build.sh`（配套 `pnpm docker:build/up/down`）。
4. **门禁与文档同步**：补齐单元测试，同步更新 `DEPLOYMENT_GUIDE.md`、`API_AND_PROTOCOLS.md`、`ROADMAP.md`、`CHANGELOG.md`。

---

## 📋 里程碑与任务清单

### 里程碑 1：主控端一键安装脚本与分发端点 (`install.sh`)
- [x] 任务 1.1: 编写 `scripts/install-agent.sh` 标准 Shell 安装脚本（支持 `--token`、`--master`、`--mode` 参数解析，架构检测 `x86_64`/`aarch64`，从主控下载 Agent/Sing-box，配置与 systemd 开机自启服务生成）。
- [x] 任务 1.2: 在 `apps/server/src/binaries` 模块实现 `GET /api/v1/install.sh` 公开端点与服务读取逻辑。
- [x] 任务 1.3: 编写 `BinariesController` / `BinariesService` 关于 `install.sh` 端点的单元测试。

### 里程碑 2：主控端自包含发布包与启动脚本增强
- [x] 任务 2.1: 增强 `scripts/master-bundle/start.sh`，新增 `AUTO_SEED`（默认 true）逻辑，首次启动或指定时自动幂等执行 `prisma db seed`。
- [x] 任务 2.2: 校验并优化 `scripts/release.sh`，确保主控发行包完整打包 `web-dist/`、多架构 Agent、`install-agent.sh` 模板及最新的 `start.sh`。

### 里程碑 3：本地 Docker 镜像构建与 Compose 编排
- [x] 任务 3.1: 编写主控端 `Dockerfile`（基于 Alpine/Debian-slim 的 Node.js 20 多阶段构建，构建 Web 与 Server 产物，配置 `/app/data` 持久化卷与启动入口）。
- [x] 任务 3.2: 编写主控端容器启动入口脚本 `scripts/docker-entrypoint.sh`（自动执行迁移与播种后启动）。
- [x] 任务 3.3: 编写节点端 `Dockerfile.agent`（多阶段构建 `riri-agent` 并内置官方 `sing-box` 内核，支持 `--network host` 运行）。
- [x] 任务 3.4: 编写根目录 `docker-compose.yml`（定义 `master` 与 `agent` 服务编排配置）。
- [x] 任务 3.5: 编写 `scripts/docker-build.sh` 本地一键镜像构建脚本，并在 `package.json` 注册 `docker:build`、`docker:up`、`docker:down` 快捷指令。

### 里程碑 4：质量门禁、文档与规范治理
- [x] 任务 4.1: 更新 `docs/DEPLOYMENT_GUIDE.md`（补充二进制自包含部署、Docker Compose 部署及一键安装说明）。
- [x] 任务 4.2: 更新 `docs/API_AND_PROTOCOLS.md`（记录 `GET /api/v1/install.sh` 端点协议规范）。
- [x] 任务 4.3: 更新 `docs/ROADMAP.md` 阶段状态与 `CHANGELOG.md` 的 `[Unreleased]` 小节。
- [x] 任务 4.4: 完成四端质量门禁（docs、server、web、agent）；Agent 在 WSL Go 1.23 容器中执行等价门禁。

---

## 🧪 验收标准与测试记录

- [x] `GET /api/v1/install.sh` 端点可用且内容符合 POSIX sh/bash 语法规范；WSL 容器冒烟返回 HTTP 200。
- [x] `Dockerfile` 与 `Dockerfile.agent` 语法有效，多阶段构建逻辑闭环；WSL 实际构建两张镜像成功。
- [x] `docker-compose.yml` 格式规范且环境变量与卷挂载清晰；WSL Compose 主控健康检查与 Agent profile 联调通过。
- [x] 四端门禁通过：Server/Web 运行 `pnpm gate:server`、`pnpm gate:web`，文档归档后运行 `pnpm gate:docs`，Agent 在 WSL Go 1.23 容器中通过 `go vet`、`gofmt`、`go test`、`CGO_ENABLED=0 go build`；PowerShell 因无 Go 工具链未执行 `pnpm gate:agent`。
