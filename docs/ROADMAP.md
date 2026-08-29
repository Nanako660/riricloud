# 阶段实施路线图 (Implementation Roadmap)

本文档制定了 **RiriCloud** 项目的完整实施阶段、任务拆解与交付物验收标准。

---

## 📅 阶段任务拆解

> **当前进度**：Phase 1 已完成，并以「最小 demo」提前打通了 Phase 2/3/4 的核心闭环（登录鉴权、节点管理、订阅生成、WS Agent Gateway、Agent 长连接与心跳上报、用户仪表盘与管理员节点页）。下方标注 ⭐ 的条目为最小 demo 已实现部分；Sing-box 内核生命周期、多格式订阅、用户管理等完整能力仍在各自 Phase 推进。

### Phase 1: 基础设施与 Monorepo 脚手架搭建
- [x] 初始化 pnpm Monorepo 根工程 (`package.json`, `pnpm-workspace.yaml`, `.gitignore`)。
- [x] 创建 `apps/web`、`apps/server`、`apps/agent` 目录结构。
- [x] 配置全局 TypeScript 与代码规范。
- [x] 落地工程治理工具链：`commitlint`（Conventional Commits 校验）+ `husky`（pre-commit 钩子）+ `lint-staged` + `.editorconfig`，规范见 [GIT_WORKFLOW.md](./GIT_WORKFLOW.md) 与 [CODE_REVIEW.md](./CODE_REVIEW.md)。
- [x] 以 `v0.1.0` 为目标建立首次发布基线：统一版本号写入根 `package.json`，维护 [CHANGELOG.md](../CHANGELOG.md) 并按 [VERSIONING.md](./VERSIONING.md) §6 流程打 Tag。
- [x] 开发环境缓存策略：pnpm store / Go module cache / 便携工具链等全部收进项目目录（`.cache/`、`.tools/`，见 `scripts/dev-env.sh`）。

### Phase 2: 主控端核心服务开发 (`apps/server`)
- [x] ⭐ 初始化 NestJS 工程，集成 Prisma ORM。
- [x] ⭐ 编写 `schema.prisma` 数据模型（User, Node, TrafficLog, SystemSetting）并完成迁移。
- [x] ⭐ 实现 JWT 认证模块（登录、注册、当前用户信息、角色守卫）。
- [x] ⭐ 实现用户管理与配额控制模块。（分页搜索、创建、配额/到期/角色/激活更新、删除、订阅令牌重置）
- [x] ⭐ 实现节点管理模块（节点创建/列表、AgentToken 派发、Reality 参数生成、热重载指令）。（编辑/删除已补齐：名称/地址/端口/是否公开可改，保存后在线节点热推送）
- [x] ⭐ 实现 WebSocket Agent Gateway（握手鉴权、心跳解析、流量入库、配置实时推送）。
- [ ] 实现通用多协议订阅生成器（Clash Meta / Sing-box / Base64）。（⭐ 已实现 Base64 URI 输出与 Subscription-Userinfo 头，Clash/Sing-box 格式待补）

### Phase 3: 边缘节点守护程序开发 (`apps/agent`)
- [x] ⭐ 初始化 Go 模块与依赖 (`gorilla/websocket`, `gopsutil`)。
- [x] ⭐ 实现 WebSocket 客户端（指数退避断线重连、心跳定时器）。
- [ ] 实现 Sing-box 内核管理（进程拉起、PID 监控、优雅停止与热重载）。（⭐ 当前仅配置落盘，内核生命周期待实现）
- [x] ⭐ 实现动态 JSON 配置文件组装与持久化。（临时文件 + rename 原子写入）
- [x] ⭐ 实现系统性能指标（CPU/内存/网络IO）采集与流量定时上报。（流量记录上报待内核接入后启用）

### Phase 4: 前端 Web 控制面板开发 (`apps/web`)
- [x] ⭐ 初始化 Vite + React + TypeScript + Tailwind CSS + shadcn/ui。
- [x] ⭐ 封装 Axios API 客户端、Auth Store 与路由拦截鉴权。
- [ ] 开发用户端界面：
  - [x] ⭐ 用户登录与注册页。（注册受系统设置开关控制）
  - [x] ⭐ 个人仪表盘（剩余流量进度条、账户有效期、一键复制/导入订阅、订阅链接重置）。
  - [x] ⭐ 可用节点列表与延迟状态。（延迟展示待内核接入）
- [ ] 开发管理员控制台：
  - [x] ⭐ 用户管理（配额修改、封禁/解封、角色设置、批量操作）。
  - [x] ⭐ 节点管理（节点添加/编辑/删除、AgentToken 与一键安装命令展示、实时 CPU/内存/带宽负载监控）。
  - [x] ⭐ 系统设置（注册开关、全局默认配额、站点名称）。

### Phase 5: 部署自动化与端到端联调验收
- [ ] 编写节点一键安装脚本 `scripts/install-agent.sh`。
- [ ] 编写主控端与 Agent 的 Dockerfile 及 `docker-compose.yml`。
- [ ] 本地全链路联调：主控添加节点 -> 启动 Agent 建立长连接 -> 订阅生成 -> 客户端连接测试 -> 流量核算与上报。

---

## 🎯 验收与交付标准

1. **零外部数据库依赖**：主控端 `pnpm start` 即可开箱即用，自动生成 SQLite 数据库。
2. **多节点无缝纳管**：在任意多台 Linux VPS 上运行 Agent，均可在主控 Web 仪表盘实时看到在线状态与负载。
3. **主流客户端全适配**：导出的订阅链接能够在 Clash Meta (Mihomo)、Sing-box 官方客户端以及 Shadowrocket 等工具中正常加载与代理翻墙。
