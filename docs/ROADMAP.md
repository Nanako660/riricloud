# 阶段实施路线图 (Implementation Roadmap)

本文档制定了 **RiriCloud** 项目的完整实施阶段、任务拆解与交付物验收标准。

---

## 📅 阶段任务拆解

> **当前进度**：Phase 1 已完成；v0.4.0 节点与线路解耦、中继拓扑、主控本机节点和线路订阅编译闭环已完成；节点详情运维、主控自包含升级分发与部署打包闭环已完成。下方标注 ⭐ 的条目为已实现部分；按用户流量统计已通过 Sing-box V2Ray API 恢复，使用按心跳周期清零的用户增量计数。视觉验证按项目约束仅在 Antigravity 环境按需执行，不接入常规门禁。

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
- [x] ⭐ 实现通用多格式订阅生成器（Clash Meta / Sing-box / Base64）：`?type=` 参数优先、User-Agent 嗅探其次、默认 Base64 URI；三种格式均返回 `Subscription-Userinfo` 与更新间隔头。

### Phase 2.1: 订阅架构与生命周期（v0.3.0）
- [x] ⭐ 新增 `Plan`、`Subscription`、`SubscriptionTemplate` 数据模型与 Prisma 迁移，扩展节点标签和等级。
- [x] ⭐ 播种默认分流模板、体验套餐，并为内置管理员和演示用户绑定订阅。
- [x] ⭐ 实现套餐 CRUD、公开套餐市场、节点动态匹配（全部/标签/显式节点）与删除保护。
- [x] ⭐ 实现用户唯一订阅生命周期：订购、即时升配、取消保留权益、到期巡检、Token 重置。
- [x] ⭐ 实现管理员订阅管控：强制换套餐、调整配额/已用流量/有效期、吊销/解冻与 Token 重置。
- [x] ⭐ 实现订阅模板 CRUD、全局默认模板、策略组/规则集/DNS 与 YAML/JSON 覆写校验。
- [x] ⭐ 重构 Clash Meta、Sing-box Client、Base64 URI 编译器，按模板输出策略组、分流规则和 DNS。

### Phase 2.2: 节点与线路解耦、中继架构（v0.4.0）
- [x] ⭐ Node 纯化为底座机器实体，新增 `isLocal` 并预置 `Master-Local`。
- [x] ⭐ 新增 Line 实体与迁移，支持直连、盲转发、协议代理、端点覆盖、倍率、标签和启停状态。
- [x] ⭐ 实现线路 CRUD、筛选、排序、复制、批量启停、解析测试和入站一键派生线路。
- [x] ⭐ `config_sync` 自动合成中继入站、目标 outbound 与 route rule，线路变更复用 250ms 防抖推送。
- [x] ⭐ Plan、Subscription、Clash/Sing-box/Base64 编译器与前端全部切换到线路匹配和展示。

### Phase 3: 边缘节点守护程序开发 (`apps/agent`)
- [x] ⭐ 初始化 Go 模块与依赖 (`gorilla/websocket`, `gopsutil`)。
- [x] ⭐ 实现 WebSocket 客户端（指数退避断线重连、心跳定时器）。
- [x] ⭐ 实现 Sing-box 内核管理（进程拉起、PID 监控、异常退出自动拉起、优雅停止与配置热应用）：supervisor 单协程托管，配置变化优雅重启、崩溃按指数退避重拉；二进制路径 `SINGBOX_BINARY_PATH`（默认走 PATH）。
- [x] ⭐ 实现动态 JSON 配置文件组装与持久化。（临时文件 + rename 原子写入）
- [x] ⭐ 实现系统性能指标（CPU/内存/网络IO）与按用户流量定时上报。（Agent 通过启用 `with_v2ray_api,with_utls,with_quic,with_naive_outbound` 的 Sing-box 本地 gRPC StatsService 读取用户增量，Master 事务扣减 Subscription 并同步 User 镜像）
- [x] ⭐ 扩展 `upgrade_task` / `upgrade_result` 与 `probe_task` / `probe_result` 消息，Master 对上行消息进行运行时校验。
- [x] ⭐ 实现安全流式下载、SHA-256 校验、原子替换、Sing-box 启动失败回滚、Agent 自更新重启与 TCP/DNS/ICMP 探针。
- [x] ⭐ 实现升级窗口 supervisor 抑制，避免替换期间重新拉起旧 Sing-box 二进制。
- [x] ⭐ Agent 现代化 CLI：Cobra 一级命令、YAML 配置分层、前台 `run` 与环境变量兼容。
- [x] ⭐ 跨平台服务生命周期：基于 `kardianos/service` 支持 Linux、Windows Service 和 macOS Launchd 的安装、注销、启停、重启和状态查询。
- [x] ⭐ Agent 自包含安装与卸载：从 Master 下载 Sing-box，失败时可回退 GitHub；`uninstall --purge` 清理服务、配置、运行时目录和托管进程。
- [x] ⭐ Agent 全屏 TUI、Doctor 与日志查看器：无参数进入 Bubble Tea 控制台 GUI，支持方向键菜单、安装表单、卸载确认、异步操作、结果滚动、Master/网络/内核/端口诊断、彩色日志和跟踪输出。

### Phase 4: 前端 Web 控制面板开发 (`apps/web`)
- [x] ⭐ 初始化 Vite + React + TypeScript + Tailwind CSS + shadcn/ui。
- [x] ⭐ 封装 Axios API 客户端、Auth Store 与路由拦截鉴权。
- [ ] 开发用户端界面：
  - [x] ⭐ 用户登录与注册页。（注册受系统设置开关控制）
  - [x] ⭐ 个人仪表盘（剩余流量进度条、账户有效期、一键复制/导入订阅、订阅链接重置）。
- [x] ⭐ 可用线路列表与底层状态。（延迟展示待内核接入）
- [ ] 开发管理员控制台：
  - [x] ⭐ 用户与订阅一体化管理（套餐/订阅聚合列表、配额与状态调整、封禁/解封、角色设置、批量操作、Token 重置）。
  - [x] ⭐ 节点管理（节点添加/编辑/删除、AgentToken 与一键安装命令展示、实时 CPU/内存/带宽负载监控）。
  - [x] ⭐ 系统设置（注册开关、全局默认配额、站点名称）。
- [x] ⭐ 套餐管理（套餐属性、线路匹配模式、模板绑定、公开/下架与删除保护）。
- [x] ⭐ 订阅模板管理（策略组、规则集、DNS、YAML/JSON 高级覆写与默认模板）。
- [x] ⭐ 订阅管控能力融合至用户管理（用户订阅列表、流量进度、状态/配额/有效期调整与 Token 重置）；原 `/admin/subscriptions` 页面入口重定向至 `/admin/users`，后端 API 保留兼容。
- [x] ⭐ 节点远程升级入口（Sing-box/Agent 目标、版本、下载 URL、SHA-256 校验）。

### Phase 4.1: 用户订阅体验（v0.3.0）
- [x] ⭐ 套餐市场：公开套餐展示、订购/升配确认与即时生效提示。
- [x] ⭐ 唯一订阅详情：当前套餐、流量进度、到期时间、线路列表、复制/重置 Token、取消订阅。
- [x] ⭐ 可用线路视图：展示倍率、等级、标签、中继机制、最终接入端点和底层在线状态。

### Phase 4.2: 节点详情运维与主控自包含升级分发（v0.3.0）
- [x] ⭐ 主控二进制分发中心：扫描多架构 Agent / Sing-box 文件，计算 SHA-256，提供受 AgentToken 保护的内部下载与管理员元数据接口。
- [x] ⭐ 升级任务默认按节点系统架构装配主控内部 URL 与校验摘要，并支持管理员导入自定义 Sing-box 文件托管。
- [x] ⭐ Node 模型持久化 Agent 版本、系统架构、内核版本与最近探针诊断快照。
- [x] ⭐ WS / HTTP 两种 Agent 通信模式统一回传版本画像、DNS 地址、延迟、丢包率和任务结果。
- [x] ⭐ 节点详情工具栏新增内核重载、Agent 重启、网络探针、升级中心和安装命令。
- [x] ⭐ 节点详情运维面板新增探针快照、错误日志格式化、软硬件画像与升级/探针交互反馈。
- [x] ⭐ 发布脚本与主控发行包装配多架构 Agent，并保留 Sing-box 多架构资产导入入口。
- [x] ⭐ 完成 Server / Web / Agent / 文档门禁与 WS / HTTP 本地真实联调验收。
- [x] ⭐ Agent 下载端点升级为 `GET /api/v1/downloads/agent`：按安装器 User-Agent 选择平台并 302 到受 AgentToken 保护的二进制资产。

### Phase 5: 部署自动化与端到端联调验收
- [x] ⭐ 移除旧节点安装脚本与 `GET /api/v1/install.sh`，改为面板生成的原生 CLI 下载/安装命令；Agent 自己注册跨平台系统服务。
- [x] ⭐ 编写主控端与 Agent 的多阶段 Dockerfile 及 `docker-compose.yml`，SQLite 使用持久化卷。
- [x] ⭐ WSL Docker 验收主控容器：迁移、幂等播种、Web 健康检查与二进制分发均通过；Agent 镜像内置静态 Agent 与官方 sing-box。

---

## 🎯 验收与交付标准

1. **零外部数据库依赖**：主控端 `pnpm start` 即可开箱即用，自动生成 SQLite 数据库。
2. **多节点无缝纳管**：在任意多台 Linux VPS 上运行 Agent，均可在主控 Web 仪表盘实时看到在线状态与负载。
3. **主流客户端全适配**：导出的订阅链接能够在 Clash Meta (Mihomo)、Sing-box 官方客户端以及 Shadowrocket 等工具中正常加载与代理翻墙。

## 🧪 v0.4.0 质量验收记录

- [x] Server：TypeScript、ESLint、Jest（14 suites / 121 tests）通过。
- [x] Web：TypeScript、ESLint、Vite build 通过。
- [x] Agent：`go vet`、`gofmt`、`go test`、`go build` 通过；PowerShell 下 `scripts/gate-agent.sh` 因 Bash 环境不可用，使用项目内 Go 工具链执行等价门禁。
- [x] Git：`git diff --check` 通过；所有变更位于独立特性分支，未直接修改、提交或推送 `main`。
- [x] 文档：模型、API/WS、架构、前端规范、视觉台账、路线图与 CHANGELOG 已同步。
- [ ] 视觉截图回归：按 `docs/VISUAL_VERIFICATION.md` 仅在 Antigravity 环境、收到明确视觉验证请求后执行（本次按要求跳过）。
- [ ] 真实代理客户端连通性：需要可用 VPS、Sing-box 内核及客户端环境，保留为部署环境验收项。
