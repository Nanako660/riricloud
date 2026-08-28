# 阶段实施路线图 (Implementation Roadmap)

本文档制定了 **RiriCloud** 项目的完整实施阶段、任务拆解与交付物验收标准。

---

## 📅 阶段任务拆解

### Phase 1: 基础设施与 Monorepo 脚手架搭建
- [ ] 初始化 pnpm Monorepo 根工程 (`package.json`, `pnpm-workspace.yaml`, `.gitignore`)。
- [ ] 创建 `apps/web`、`apps/server`、`apps/agent` 目录结构。
- [ ] 配置全局 TypeScript 与代码规范。
- [ ] 落地工程治理工具链：`commitlint`（Conventional Commits 校验）+ `husky`（pre-commit 钩子）+ `lint-staged` + `.editorconfig`，规范见 [GIT_WORKFLOW.md](./GIT_WORKFLOW.md) 与 [CODE_REVIEW.md](./CODE_REVIEW.md)。
- [ ] 以 `v0.1.0` 为目标建立首次发布基线：统一版本号写入根 `package.json`，维护 [CHANGELOG.md](../CHANGELOG.md) 并按 [VERSIONING.md](./VERSIONING.md) §6 流程打 Tag。

### Phase 2: 主控端核心服务开发 (`apps/server`)
- [ ] 初始化 NestJS 工程，集成 Prisma ORM。
- [ ] 编写 `schema.prisma` 数据模型（User, Node, TrafficLog, SystemSetting）并完成迁移。
- [ ] 实现 JWT 认证模块（注册、登录、当前用户信息、角色守卫）。
- [ ] 实现用户管理与配额控制模块。
- [ ] 实现节点管理模块（节点增删改查、AgentToken 派发、Reality/Hysteria2 协议参数生成）。
- [ ] 实现 WebSocket Agent Gateway（握手鉴权、心跳解析、流量入库、配置实时推送）。
- [ ] 实现通用多协议订阅生成器（Clash Meta / Sing-box / Base64）。

### Phase 3: 边缘节点守护程序开发 (`apps/agent`)
- [ ] 初始化 Go 模块与依赖 (`gorilla/websocket`, `gopsutil`)。
- [ ] 实现 WebSocket 客户端（指数退避断线重连、心跳定时器）。
- [ ] 实现 Sing-box 内核管理（进程拉起、PID 监控、优雅停止与热重载）。
- [ ] 实现动态 JSON 配置文件组装与持久化。
- [ ] 实现系统性能指标（CPU/内存/网络IO）采集与流量定时上报。

### Phase 4: 前端 Web 控制面板开发 (`apps/web`)
- [ ] 初始化 Vite + React + TypeScript + Tailwind CSS + shadcn/ui。
- [ ] 封装 Axios API 客户端、Auth Store 与路由拦截鉴权。
- [ ] 开发用户端界面：
  - 用户登录与注册页。
  - 个人仪表盘（剩余流量进度条、账户有效期、一键复制/导入订阅）。
  - 可用节点列表与延迟状态。
- [ ] 开发管理员控制台：
  - 用户管理（配额修改、封禁/解封、角色设置）。
  - 节点管理（节点添加/编辑、一键安装命令生成 Modal、实时 CPU/内存/带宽负载监控看板）。
  - 系统设置（注册开关、全局默认配额）。

### Phase 5: 部署自动化与端到端联调验收
- [ ] 编写节点一键安装脚本 `scripts/install-agent.sh`。
- [ ] 编写主控端与 Agent 的 Dockerfile 及 `docker-compose.yml`。
- [ ] 本地全链路联调：主控添加节点 -> 启动 Agent 建立长连接 -> 订阅生成 -> 客户端连接测试 -> 流量核算与上报。

---

## 🎯 验收与交付标准

1. **零外部数据库依赖**：主控端 `pnpm start` 即可开箱即用，自动生成 SQLite 数据库。
2. **多节点无缝纳管**：在任意多台 Linux VPS 上运行 Agent，均可在主控 Web 仪表盘实时看到在线状态与负载。
3. **主流客户端全适配**：导出的订阅链接能够在 Clash Meta (Mihomo)、Sing-box 官方客户端以及 Shadowrocket 等工具中正常加载与代理翻墙。
