# AGENTS.md — AI 代理工作规范

本文件面向在本仓库工作的一切 AI 编码代理（以及新加入的人类协作者）。开始任何任务前，你被默认已阅读并同意本文件。项目详细设计见 `docs/` 文档库，本文件只做**索引与硬性规则摘要**，规则冲突时以 `docs/` 下的规范文档为准。

---

## 项目概述

**RiriCloud** 是一个多节点 VPN/代理管理系统：NestJS + React + SQLite 的主控面板（Master），通过 WSS 长连接纳管运行在多台 VPS 上的 Go Agent（托管 Sing-box 内核），统一输出多格式订阅。

**当前进度：最小 demo（v0.1.0 基线）已跑通全链路。** 三端脚手架与核心闭环（登录 → 建节点 → Agent 上线心跳 → 仪表盘遥测 → 订阅输出）已落地，本地验收与质量门禁全绿；完整功能（Sing-box 内核管理、多格式订阅、用户管理等）按里程碑推进，详见 [docs/ROADMAP.md](docs/ROADMAP.md)。

> **开发环境**：所有依赖缓存与便携工具链收进项目目录（`.cache/`、`.tools/`，已 gitignore）。开发前先在 Git Bash 中 `source scripts/dev-env.sh`——它会设置 pnpm store、Prisma 缓存、Go 工具链（`.tools/go`）与 Go module cache 的项目内路径。首次搭建：pnpm 环境下执行 `pnpm setup`（install + 迁移 + 种子数据）。

### 目录结构

```
riricloud/
├── docs/              # 设计与规范文档库
├── apps/              # 三端应用（已落地）
│   ├── web/           # React + Vite 前端（@riricloud/web）
│   ├── server/        # NestJS 主控后端（@riricloud/server，含 Prisma schema）
│   └── agent/         # Go 边缘节点守护程序
├── scripts/           # dev-env.sh（缓存环境）、gate-agent.sh（Go 门禁）
├── .cache/            # 【gitignore】依赖缓存（pnpm/npm/corepack/go）
├── .tools/            # 【gitignore】便携工具链（如本地 Go）
├── AGENTS.md          # 本文件
└── CHANGELOG.md       # 变更日志
```

> `apps/*` 脚手架建立后，各子目录可按需增设更细粒度的 AGENTS.md（如 `apps/agent/AGENTS.md` 覆盖 Go 特有约定），子级规则不得与本文件和 `docs/` 规范冲突。

---

## 按任务类型的必读文档

动手前**必读**对应列的全部文档（`docs/` 前缀省略）：

| 任务类型 | 必读 | 参考 |
| :--- | :--- | :--- |
| 任何任务（首次进入仓库） | `README.md`、`ARCHITECTURE.md`、`PROJECT_CONSTRAINTS.md` | — |
| 写 `apps/server` 代码 | `TECH_STACK.md`、`API_AND_PROTOCOLS.md`、`DATA_MODELS.md`、`CODE_REVIEW.md` | `DEPLOYMENT_GUIDE.md` |
| 写 `apps/web` 代码 | `TECH_STACK.md`、`API_AND_PROTOCOLS.md`、`FRONTEND_UI_GUIDELINES.md`、`CODE_REVIEW.md` | `ARCHITECTURE.md` |
| 写 `apps/agent` 代码 | `TECH_STACK.md`、`API_AND_PROTOCOLS.md`、`CODE_REVIEW.md` | `DEPLOYMENT_GUIDE.md` |
| 改 WS 协议 / API / 订阅格式 | `API_AND_PROTOCOLS.md`、`VERSIONING.md`（判断破坏性变更） | `ARCHITECTURE.md` |
| 改数据模型 | `DATA_MODELS.md`、`PROJECT_CONSTRAINTS.md` §5 | — |
| 提交 / 合并 / 发版 | `GIT_WORKFLOW.md`、`VERSIONING.md` | `CODE_REVIEW.md` §2 |
| 改工程配置 / CI / 依赖 | `PROJECT_CONSTRAINTS.md`、`CODE_REVIEW.md` §4 | `TECH_STACK.md` |

---

## 硬性规则摘要（违反即返工）

1. **技术栈锁定**：只用 [docs/TECH_STACK.md](docs/TECH_STACK.md) 选定的技术；禁止引入外部数据库/Redis/MQ（零依赖红线）。
2. **版本最小递增**：能 PATCH 不 MINOR，能 MINOR 不 MAJOR；三应用共用根 `package.json` 的统一版本号，不私设版本（[docs/VERSIONING.md](docs/VERSIONING.md)）。
3. **提交规范**：Conventional Commits，英文 type + 中文描述（`feat(server): 实现用户登录`）；原子提交；破坏性变更标 `!` + `BREAKING CHANGE`（[docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md)）。
4. **分支模型**：GitHub Flow；main 受保护，一切变更走 PR；squash merge，PR 标题即提交信息。
5. **分层约束**：Controller 不碰 Prisma；WS Gateway 复用 Service；前端请求只走统一 API 客户端；前端 UI 强制遵循 [docs/FRONTEND_UI_GUIDELINES.md](docs/FRONTEND_UI_GUIDELINES.md) 与 shadcn/ui 规范（禁裸 HTML 交互标签）；Go 禁 CGO、goroutine 必须可退出（[docs/CODE_REVIEW.md](docs/CODE_REVIEW.md) §3）。
6. **文档同步**：改了什么就必须同一 PR 更新对应文档（映射表见下）；代码与文档不一致视为 bug。
7. **安全红线**：密钥不入 git/日志；生产强制 HTTPS/WSS；密码 bcrypt；服务端默认拒绝鉴权（[docs/PROJECT_CONSTRAINTS.md](docs/PROJECT_CONSTRAINTS.md) §4）。
8. **语言约定**：标识符与日志英文，注释/commit/文档中文（[docs/PROJECT_CONSTRAINTS.md](docs/PROJECT_CONSTRAINTS.md) §6）。
9. **质量门禁**：合入 main 前本 §常用命令 全绿；修 bug 先写复现测试。
10. **不越权**：架构级决策（换框架、加外部服务、突破资源上限）不得自行实施——先提 RFC 改文档，获批准后再动代码。

---

## 改了什么 → 必须更新什么

| 变更内容 | 必须同一 PR 更新 |
| :--- | :--- |
| REST / WS / 订阅格式 | `docs/API_AND_PROTOCOLS.md` |
| Prisma 模型或迁移 | `docs/DATA_MODELS.md` |
| 组件、通信链路、时序 | `docs/ARCHITECTURE.md` |
| 前端 UI 规范、主题、组件层级 | `docs/FRONTEND_UI_GUIDELINES.md` |
| 选型或依赖库增删 | `docs/TECH_STACK.md` |
| 部署方式或脚本行为 | `docs/DEPLOYMENT_GUIDE.md` |
| 规范与红线本身 | `docs/VERSIONING.md` / `GIT_WORKFLOW.md` / `CODE_REVIEW.md` / `PROJECT_CONSTRAINTS.md` |
| 里程碑完成 | `docs/ROADMAP.md` 勾选 |
| 用户可感知的功能/修复 | `CHANGELOG.md` 的 `[Unreleased]` 段 |

---

## 常用命令

> 所有命令在 Git Bash 中执行；Go 相关命令需先 `source scripts/dev-env.sh`（未装系统 Go 时自动使用 `.tools/go`）。

```bash
# 首次搭建（安装依赖 + 数据库迁移 + 种子数据，含演示管理员）
pnpm setup

# 安装依赖（根目录执行）
pnpm install

# 开发模式
pnpm dev:server    # NestJS 主控（http://localhost:3000，API 文档 /api/docs）
pnpm dev:web       # Vite 前端（http://localhost:5173，代理 /api → 3000）

# 质量门禁（提交前本地自查，三端一次全跑用 pnpm gate）
pnpm gate:server   # tsc --noEmit + eslint + jest
pnpm gate:web      # tsc --noEmit + eslint + vite build
pnpm gate:agent    # go vet + gofmt + go test + go build（经 scripts/gate-agent.sh）

# 数据库迁移与种子（server）
pnpm --filter @riricloud/server exec prisma migrate dev
pnpm --filter @riricloud/server exec prisma db seed

# 本地运行 Agent（演示联调；token 来自管理员节点页）
cd apps/agent && AGENT_TOKEN=<token> MASTER_WS_URL=ws://localhost:3000/ws/agent ./riri-agent.exe

# 发布版本（本地脚本：门禁复跑 → 三平台构建 → 打包校验 → gh CLI 创建 Release）
bash scripts/release.sh
```

Git 操作约定：从 main 切出 `feat|fix|docs|chore/<scope>-<desc>` 分支 → 提交（husky + commitlint 校验信息格式）→ push → PR → 门禁全绿 → squash merge。

---

## 工作习惯要求

- **先读后写**：修改任何模块前先读该模块现有代码与对应文档；不确定契约时以文档为准，文档缺失时先补文档。
- **小步提交**：每次提交都应是可编译、可回滚的完整单元；长任务拆多个原子提交。
- **如实汇报**：门禁失败、跳过的步骤、未完成的 TODO 必须在 PR/回复中明说，不得静默绕过。
- **不擅自扩权**：发现需要破坏红线或改规范时，停下来把问题与建议写清楚交给维护者决策。
