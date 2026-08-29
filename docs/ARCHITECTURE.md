# 系统架构设计 (Architecture Design)

## 1. 总体架构拓扑

RiriCloud 采用清晰的 **Master-Agent（控制平面 - 数据平面）** 分布式解耦架构设计：

```mermaid
graph TB
    subgraph "客户端终端 (End Users & Admins)"
        UserBrowser["管理员 & 用户 Web 浏览器<br/>(Chrome / Safari / Edge)"]
        VpnClients["多平台代理/VPN 客户端<br/>(Clash Meta / Sing-box / Shadowrocket / v2rayN)"]
    end

    subgraph "主控中心 (Master Server - Control Plane)"
        direction TB
        FrontendUI["Web 前端静态站点<br/>(React + Vite + shadcn/ui)"]
        APIServer["RESTful API 业务服务<br/>(NestJS + TypeScript)"]
        WSGateway["WebSocket 主从实时网关<br/>(@nestjs/websockets - ws)"]
        SubscriptionEngine["通用多格式订阅生成引擎<br/>(YAML / JSON / Base64)"]
        SQLiteDB[("SQLite 数据库 (WAL 模式)<br/>Prisma ORM")]
        
        FrontendUI -->|"HTTP(S)"| APIServer
        APIServer <-->|"CRUD"| SQLiteDB
        APIServer <--> WSGateway
        APIServer <--> SubscriptionEngine
    end

    subgraph "边缘节点 A (Edge Node 1 - Data Plane)"
        direction TB
        AgentA["Go Node Agent 守护进程<br/>(riri-agent binary)"]
        SingboxA["Sing-box 代理内核进程<br/>(Inbounds: VLESS-Reality / Hysteria2)"]
        SystemMonitorA["系统资源与网络监测器<br/>(gopsutil)"]

        AgentA <-->|"本地进程 & JSON 配置管理"| SingboxA
        SystemMonitorA -->|"收集 CPU/内存/IO"| AgentA
    end

    subgraph "边缘节点 B (Edge Node 2 - Data Plane)"
        direction TB
        AgentB["Go Node Agent 守护进程<br/>(riri-agent binary)"]
        SingboxB["Sing-box 代理内核进程<br/>(Inbounds: Shadowsocks / TUIC)"]
        SystemMonitorB["系统资源与网络监测器<br/>(gopsutil)"]

        AgentB <-->|"本地进程 & JSON 配置管理"| SingboxB
        SystemMonitorB -->|"收集 CPU/内存/IO"| AgentB
    end

    UserBrowser -->|"HTTPS 管理与访问"| FrontendUI
    VpnClients -->|"HTTP(S) 拉取订阅"| SubscriptionEngine
    VpnClients -->|"加密代理流量"| SingboxA
    VpnClients -->|"加密代理流量"| SingboxB

    AgentA <-->|"WSS 安全长连接 (心跳 / 配置下发 / 流量上报)"| WSGateway
    AgentB <-->|"WSS 安全长连接 (心跳 / 配置下发 / 流量上报)"| WSGateway
```

---

## 2. 核心组件分工

### 2.1 主控中心 (Master Server)
- **Web UI (`apps/web`)**：为用户和管理员提供现代化的 Web 控制界面。包括用户注册登录、流量仪表盘、节点列表、通用订阅导出，以及管理员的用户管理、节点纳管、配置下发和系统状态监控。
- **业务 API 服务 (`apps/server`)**：基于 NestJS 框架开发，提供标准的 RESTful 接口与 JWT 鉴权。
- **WebSocket 实时网关 (`apps/server/agent-gateway`)**：与分布在全球的各 Node Agent 保持双向全双工长连接，实现秒级状态同步与实时配置热推。
- **订阅引擎 (`apps/server/subscription`)**：根据用户的有效权限与节点公开入站（`NodeInbound.isPublic`），实时动态组装多协议（VLESS Reality / Hysteria2 / Shadowsocks / TUIC）三格式订阅：Clash Meta (Mihomo) YAML、Sing-box Client JSON 以及通用 Base64 URI 列表。输出名规则：单入站节点用节点名，多入站节点为「节点名·tag」，重名全局去重。
- **入站配置组装 (`apps/server/common/inbound.ts`)**：入站参数归一化（默认值填充/密钥自动生成/必填校验）与 sing-box 服务端入站 JSON 组装的单一实现，`config_sync` 与订阅 builders 复用，避免两处各持一份协议知识。
- **持久化层 (Prisma + SQLite)**：单文件轻量化存储，开启 WAL（Write-Ahead Logging）模式支持高并发读取，免去维护额外数据库容器的运维负担。

### 2.2 边缘节点守护程序 (Node Agent - `apps/agent`)
- **长连接与自愈**：Agent 启动后主动与 Master 建立 WSS 连接，内置重试与断线重连机制。
- **内核生命周期管理**：Agent 内置 supervisor 单协程托管 Sing-box 子进程——`config_sync` 原子落盘后拉起内核（二进制路径 `SINGBOX_BINARY_PATH`，默认走 PATH），配置字节比对变化时优雅重启（SIGTERM → 宽限 → Kill）即热应用，进程异常退出按指数退避自动拉起。内核二进制由部署方式提供（自动下载校验留待 Phase 5 一键脚本）。
- **配置预检与回滚（v0.3.0）**：落盘后、拉起前执行 `sing-box check -c` 预检（15s 超时）；失败则拒绝该配置、把磁盘回滚为 lastGood、在跑内核不受影响，并通过 `config_apply_result` 回执失败原因。内核 stderr 环形采样尾部 8KB，异常退出原因随心跳 `lastError` 上报。
- **多入站监听**：节点可挂多条不同协议入站（`NodeInbound`，结构见 `docs/DATA_MODELS.md` §2.1）；hy2/tuic 服务端 TLS 证书为 Agent 机本地路径，主控不托管证书文件。
- **系统遥测 (Telemetry)**：基于 `gopsutil` 定期采集服务器 CPU 占用、内存使用、磁盘及实时网络带宽吞吐，随心跳上报（含内核状态 `kernelRunning`/`appliedConfigVersion`/`lastError`，落 `Node.kernelRunning`/`Node.configError`）。
- **流量统计与上报**：协议已约定按用户 UUID 的增量流量字段；因 sing-box 官方统计接口（Clash API `/connections`）暂不提供连接到入站用户的归属字段，按用户采集暂缓，待上游能力就绪后启用。SS 入站为共享密码模式，按用户流量归属在该协议下不可用（按用户配额粒度本就暂缓，可接受）。

---

## 3. 核心业务与数据交互时序

### 3.1 节点接入与全自动初始化流程

```mermaid
sequenceDiagram
    autonumber
    actor Admin as 管理员
    participant Web as Master Web面板
    participant Master as Master 后端服务
    participant Agent as VPS Node Agent
    participant Singbox as Sing-box 内核

    Admin->>Web: 1. 在面板创建节点（基础信息）并按需添加多条入站（协议/端口/参数）
    Web->>Master: POST /api/v1/admin/nodes 与 /admin/nodes/:id/inbounds
    Master-->>Web: 返回 Node ID 及生成的专属 AgentToken
    Web-->>Admin: 展示一键安装命令 (curl ... | bash -s -- --token=xxx)
    
    Admin->>Agent: 2. 在 VPS 执行一键安装脚本
    Note over Agent: 脚本下载 riri-agent 二进制与 sing-box 内核，注册 systemd
    Agent->>Master: 3. 发起 WSS 连接: /ws/agent?token=xxx
    Master->>Master: 4. 鉴权 AgentToken & 标记节点状态为 ONLINE
    Master-->>Agent: 5. 握手成功并下发当前全量 Sing-box 配置文件 JSON
    Agent->>Singbox: 6. 写入 config.json 并启动 Sing-box 守护进程
    Singbox-->>Agent: 启动成功 (监听端口就绪)
    Agent-->>Master: 7. 上报服务启动成功状态
```

### 3.2 节点遥测心跳与流量核算

```mermaid
sequenceDiagram
    autonumber
    participant Agent as VPS Node Agent
    participant Singbox as Sing-box 内核
    participant Master as Master 后端服务
    participant DB as SQLite 数据库

    loop 每 5~10 秒
        Agent->>Agent: 采集系统 CPU / 内存 / 网速
        Agent->>Singbox: 查询各用户已消耗流量 (Upload/Download)（暂缓：上游统计接口无用户归属）
        Agent->>Master: 发送 Heartbeat WSS 消息 (系统指标 + 增量流量数据)
        Master->>DB: 更新节点状态、记录 TrafficLog、扣减用户剩余配额
        
        alt 发现某用户已过期或配额耗尽
            Master->>Master: 从该节点白名单中剔除该用户 UUID
            Master-->>Agent: 下发 config_sync (更新后的配置 JSON)
            Agent->>Singbox: 持久化并优雅重启内核 (配置热应用)
        end
    end
```

---

## 4. 安全设计 (Security Architecture)

1. **管理与用户访问安全**：
   - 密码使用 `bcrypt` 单向哈希加盐存储。
   - API 采用 JWT 无状态鉴权，具备过期时间与刷新机制。
   - 角色访问控制（RBAC）：细分 `ADMIN` 和 `USER` 权限路由守卫。
2. **Master-Agent 通信安全**：
   - 生产环境强制采用 WSS (WebSocket over TLS) 加密传输。
   - 每个节点在主控端创建时分配唯一的 `AgentToken`（64位高熵随机串），Agent 握手时强制鉴权。
3. **代理传输安全 (Reality / TLS)**：
   - 首推 **VLESS + Reality** 协议：无需自备域名与公网证书，通过窃用大型合法网站（如 `www.apple.com`, `gateway.icloud.com` 等）的 SNI 与 TLS 握手特征，实现极强的抗封锁能力。
   - 支持 **Hysteria2 / TUIC** 协议：基于 UDP/QUIC，具备拥塞控制与抗高丢包能力。
