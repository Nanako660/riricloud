# 技术选型全景 (Technology Stack)

## 1. 技术全景概览

RiriCloud 在设计之初便秉持 **“开发敏捷、架构清晰、零运维依赖、边缘资源极简”** 的原则，选型矩阵如下：

| 分层 / 领域 | 选用技术 / 框架 | 核心定位与价值 |
| :--- | :--- | :--- |
| **工程架构** | **pnpm Workspace (Monorepo)** | 统一包管理，前后端代码同仓维护，统一构建脚本与类型定义 |
| **前端框架** | **React 19 + TypeScript + Vite 6** | 快速热更新开发体验，强类型保障，现代 Web 生态 |
| **前端样式与组件库** | **Tailwind CSS + shadcn/ui + Lucide Icons** | 极简现代化无边框风格设计，高可定制性，开箱即用高质量组件 |
| **主控后端框架** | **NestJS + TypeScript** | 企业级 IoC/DI 依赖注入架构，模块化清晰，代码组织规范 |
| **持久化与 ORM** | **SQLite + Prisma ORM (WAL 模式)** | 单文件数据库零外部依赖，Prisma 提供端到端类型安全与自动迁移 |
| **主从通信网关** | **`@nestjs/websockets` + `ws`** | 高性能双向长连接，低延迟全双工推送心跳与配置 |
| **认证与密码** | **JWT (Passport) + bcryptjs** | 无状态 Bearer Token 鉴权；bcryptjs 为 bcrypt 算法的纯 JS 实现（成本因子 ≥ 10），哈希产物与原生 bcrypt 兼容，免去 Windows/交叉编译环境的原生依赖问题 |
| **边缘节点 Agent** | **Go (Golang 1.25+) + Cobra + Bubble Tea + Lip Gloss + kardianos/service** | 单一静态二进制，内置跨平台 CLI、全屏控制台 GUI/TUI、服务生命周期和前台运行模式 |
| **代理协议内核** | **Sing-box** | 新一代全协议通用核心（VLESS-Reality / Hysteria2 / Shadowsocks / TUIC） |

---

## 2. 前端技术栈详解 (`apps/web`)

### 2.1 核心选型与工具链
- **Vite**：下一代前端构建工具，极速冷启动与秒级 HMR 热更新。
- **React Router v6**：声明式路由管理，支持路由守卫（AuthGuard、AdminGuard）与懒加载。
- **TanStack Query (React Query)**：处理服务端状态缓存、自动重新请求与加载状态管理。
- **Zustand**：极简轻量的前端全局状态管理（存储当前登录用户信息、Token 及全局 UI 配置）。
- **Tailwind CSS & shadcn/ui**：
  - 基于 Radix UI 原语的优质无障碍组件，采用 New York 风格预设与 Zinc 灰色系。
  - 直接复制代码进项目源码，杜绝第三方重型 UI 库的样式锁定与难以覆盖的问题。详细规范见 [FRONTEND_UI_GUIDELINES.md](./FRONTEND_UI_GUIDELINES.md)。
- **Lucide React**：全站统一图标库。
- **React Hook Form + Zod**：强类型端到端表单状态管理与 Schema 校验。
- **Sonner**：现代化轻量全局 Toast 提示。
- **TanStack Table (React Table v8)**：复杂数据表格（节点列表、用户列表、审计日志）的核心驱动。
- **CodeMirror 6（`@uiw/react-codemirror` + `@codemirror/view` + `@codemirror/lang-json` / `@codemirror/lang-yaml` / `@codemirror/lang-css` / `@codemirror/lang-html`）**：节点详情页高级模式、系统设置页 CSS/HTML/JS 编辑器和订阅模板 YAML/JSON 编辑器，带语法高亮、行号与可控的内部滚动；`@uiw/react-codemirror` 为官方推荐的 React 封装，按路由懒加载分包。
- **Recharts (via shadcn/ui Chart)**：用于呈现管理员流量统计与单用户流量下钻的流量/速率时序面积图、柱状图和线路 Donut 图；图表通过 CSS 语义 Token 适配明暗主题。
- **next-themes**：暗黑/明亮主题平滑切换与系统偏好监听。

---

## 3. 主控后端技术栈详解 (`apps/server`)

### 3.1 核心选型与架构分层
- **NestJS**：
  - 标准 Controller -> Service -> Repository 分层架构。
  - 内置基于 Decorator 的 `class-validator` 与 `class-transformer`，对入参进行强校验。
  - 内置 Swagger (`@nestjs/swagger`)，自动生成 OpenAPI 交互式在线接口文档。
- **Prisma ORM**：
  - 通过清晰的 `schema.prisma` 建模，生成强类型 TypeScript 客户端。
  - 支持声明式 Database Migrations。
- **SQLite (WAL 模式)**：
  - 零配置安装，避免额外维护 MySQL / PostgreSQL 服务。
  - Master 启动时显式设置 `journal_mode=WAL` 与 `busy_timeout=10000`；如果运行目录不支持 WAL，启动日志会记录调优失败。
  - Agent 心跳按节点串行落库，流量账务保留短事务，速率历史清理由低频巡检执行，避免高频心跳长期占用写锁。
- **JWT & Passport**：
  - 标准无状态 Bearer Token 认证。
- **YAML 序列化（`yaml`）**：
  - Clash Meta 订阅输出需要将配置对象序列化为 YAML；选用纯 JS、零传递依赖且活跃维护的 [`yaml`](https://github.com/eemeli/yaml) 包，不引入原生编译依赖。

---

## 4. 边缘节点技术栈详解 (`apps/agent`)

### 4.1 为什么节点端选择 Go 语言？
1. **单静态二进制分发**：编译后为一个独立的可执行文件（`riri-agent`），不依赖目标服务器的 glibc 版本，无需安装 Node.js、Python 或任何运行环境。
2. **极低资源开销**：常驻内存占用仅需 10MB~20MB，即使在 256MB / 512MB 的低配 VPS 上也能丝滑运行。
3. **原生网络与并发模型**：Goroutine 与 Channel 天然适合处理网络长连接心跳与子进程管理。

### 4.2 核心第三方库
- `github.com/gorilla/websocket`：工业级成熟稳定的 WebSocket 客户端实现。
- `github.com/shirou/gopsutil/v3`：跨平台采集 Linux / Darwin / Windows 的 CPU、Memory、Disk、Net IO 指标。
- `github.com/sirupsen/logrus` 或 `go.uber.org/zap`：结构化日志输出。
- `google.golang.org/grpc` + `google.golang.org/protobuf`：访问 Sing-box `experimental.v2ray_api` 的本地 StatsService；仅携带最小生成客户端代码，不引入 V2Ray/Sing-box Go 运行时。
- `github.com/spf13/cobra`：扁平一级子命令（`install`、`uninstall`、`start`、`stop`、`restart`、`status`、`doctor`、`logs`、`run`、`version`）。
- `github.com/charmbracelet/bubbletea`：提供 raw mode、方向键事件、全屏备用缓冲区和异步命令消息循环；无参数运行时的 TUI 不依赖按行输入或数字菜单。
- `github.com/kardianos/service`：封装 Linux systemd/OpenRC/SysVinit、Windows Service 和 macOS Launchd 的注册与控制。
- `github.com/charmbracelet/lipgloss`：全屏 TUI 的 Banner、表单、状态卡片、结果页和诊断颜色。
- `gopkg.in/yaml.v3`：读写 `/etc/riri-agent/config.yaml`（Windows 使用 `%ProgramData%\RiriCloud\config.yaml`），并以环境变量覆盖容器运行时配置。

Docker 与发行包中的 Sing-box 使用 `with_v2ray_api,with_utls,with_quic,with_naive_outbound` 构建标签，以启用按用户流量统计、VLESS Reality、Hysteria2、TUIC 和 NaiveProxy 出站；Agent 仍保持 `CGO_ENABLED=0` 静态构建。

---

## 5. 代理核心对比 (Sing-box vs Xray-core)

| 特性维度 | Sing-box (本项目采用) | Xray-core |
| :--- | :--- | :--- |
| **现代协议支持** | 原生支持 VLESS-Reality、Hysteria2、TUIC、Shadowsocks、WireGuard 等 | 强力支持 VLESS-Reality、Trojan、VMess、XTLS |
| **内存与 CPU 开销** | 极低（Golang 原生精简架构） | 较低 |
| **配置文件格式** | 结构规范、层级极简清晰的 JSON | 历史包袱略多，配置项较繁琐 |
| **通用客户端生态** | Sing-box iOS/Android/Desktop 官方客户端、Clash Meta | v2rayN、v2rayNG、Shadowrocket |
