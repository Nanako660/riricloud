# 数据模型设计 (Data Models)

## 1. 数据库架构设计

RiriCloud 采用 SQLite 配合 Prisma ORM 进行持久化。在生产环境中，SQLite 开启 **WAL (Write-Ahead Logging)** 模式，读写并发能力大幅提升。

> **落地说明（v0.3.0）**：Prisma 对 SQLite 不支持 `enum` 类型，角色、节点状态、协议、套餐匹配模式与订阅状态在 `schema.prisma` 中落地为 **String 字段 + 默认值**，取值约束由应用层完成（DTO 的 class-validator 与服务层校验）。下方 schema 中的 `enum` 定义视为**逻辑枚举**，实际类型以仓库内 schema.prisma 为准。`Plan`、`SubscriptionTemplate`、`Subscription` 已通过迁移 `20260830134013_subscription_plans` 落地。

---

## 2. 种子数据（首次启动引导）

首个管理员账号通过 **Prisma seed 脚本**（`apps/server/prisma/seed.js`）幂等创建，机制如下：

- 执行 `pnpm --filter @riricloud/server exec prisma db seed`（已并入根 `pnpm setup`）。
- 默认播种两个演示账号：`admin@riricloud.local`（ADMIN）与 `demo@riricloud.local`（USER）；邮箱与密码可通过环境变量 `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` 覆盖（默认值仅用于本地演示，生产环境务必修改）。
- 幂等性：按 email upsert，重复执行不产生重复数据；已存在账号仅补齐角色与激活状态。

---

## 2. Prisma Schema 完整定义

文件路径：`apps/server/prisma/schema.prisma`

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// 用户角色（SQLite 落地为 String，逻辑枚举）
enum Role {
  ADMIN   // 系统超级管理员
  USER    // 普通终端用户
}

// 节点运行状态
enum NodeStatus {
  ONLINE    // 在线正常工作中
  OFFLINE   // 离线/失联
  DISABLED  // 手动禁用维护中
}

// 支持的代理协议类型（逻辑枚举）
enum ProtocolType {
  VLESS VMESS TROJAN HYSTERIA2 TUIC SHADOWSOCKS NAIVE SHADOWTLS MIXED SOCKS HTTP DIRECT
}

// ==============================
// 1. 用户实体 (User)
// ==============================
model User {
  id                String       @id @default(uuid())
  email             String       @unique
  passwordHash      String
  role              String       @default("USER")
  
  // 流量与套餐控制
  trafficLimitBytes BigInt       @default(107374182400) // 流量配额 (默认 100GB)
  trafficUsedBytes  BigInt       @default(0)            // 已用流量 (字节)
  expireAt          DateTime?                           // 账号过期时间 (为空表示永久)
  
  // 代理与订阅凭证
  subscriptionToken String       @unique @default(uuid()) // 订阅 URL 唯一样条
  uuid              String       @unique @default(uuid()) // VLESS / Sing-box 用户识别 UUID
  password          String?                               // 用于 Shadowsocks/Hysteria2 连接密码
  
  isActive          Boolean      @default(true)          // 是否启用
  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @updatedAt

  // 关联
  trafficLogs       TrafficLog[]
  subscription      Subscription?

  @@index([role])
  @@index([isActive])
}

// ==============================
// 2. 节点实体 (Node)
// ==============================
model Node {
  id              String        @id @default(uuid())
  name            String                                // 节点显示名称 (如 "🇯🇵 东京 01 - 专线")
  serverHost      String                                // 节点公网 IP 或解析域名

  // 高级模式：完整 singboxConfig 顶层覆盖 JSON（与生成配置深合并；含 inbounds 则整组替换）
  configOverride String?

  // 主从长连接通信凭证
  agentToken      String        @unique @default(uuid()) // Agent 接入认证密钥
  status          NodeStatus    @default(OFFLINE)        // 实时状态
  lastSeenAt      DateTime?                              // 最近心跳时间

  // 实时遥测指标
  cpuUsage        Float         @default(0)             // CPU 使用率 (0~100)
  memoryUsage     Float         @default(0)             // 内存使用率 (0~100)
  bandwidthRate   Float         @default(0)             // 实时网络速率 (bytes/s)

  // 内核状态（v0.3.0，Agent 心跳上报；旧版 Agent 不上报时保持 null）
  kernelRunning   Boolean?                               // sing-box 内核进程存活
  configError     String?                                // 最近一次配置应用失败原因（成功后清空）

  // 套餐节点匹配
  tagsJson         String        @default("[]")          // 节点标签数组 JSON
  level            Int           @default(0)              // 节点等级

  // 展示与权限
  sortOrder       Int           @default(0)             // 排序权重
  isPublic        Boolean       @default(true)          // 是否对所有普通用户公开
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  // 关联
  inbounds        NodeInbound[]
  trafficLogs     TrafficLog[]

  @@index([status])
  @@index([isPublic])
}

// ==============================
// 2.1 节点入站实体 (NodeInbound，v0.3.0)
// 一个节点可挂多条入站（多协议并存）；端口/tag 节点内唯一性约束见 §3.1
// ==============================
model NodeInbound {
  id         String   @id @default(uuid())
  nodeId     String
  type       String   // ProtocolType: VLESS | VMESS | TROJAN | HYSTERIA2 | TUIC | SHADOWSOCKS | NAIVE | SHADOWTLS | MIXED | SOCKS | HTTP | DIRECT
  tag        String   // sing-box 入站 tag，节点内唯一
  listen     String   @default("::")
  port       Int
  paramsJson String   @default("{}") // 协议专属参数 JSON（结构见 §3.1）
  sortOrder  Int      @default(0)
  isPublic   Boolean  @default(true) // 是否进入订阅输出
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  node Node @relation(fields: [nodeId], references: [id], onDelete: Cascade)

  @@unique([nodeId, tag])
  @@index([nodeId])
}

// ==============================
// 2.2 套餐实体 (Plan，v0.3.0)
// ==============================
model Plan {
  id                String   @id @default(uuid())
  name              String
  description       String?
  price             Int      @default(0) // 最小货币单位
  durationDays      Int
  trafficLimitBytes BigInt
  nodeMatchMode     String   @default("ALL") // ALL | TAGS | EXPLICIT
  nodeTagsJson      String   @default("[]")
  nodeIdsJson       String   @default("[]")
  templateId        String?
  isPublic          Boolean  @default(true)
  sortOrder         Int      @default(0)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  template      SubscriptionTemplate? @relation(fields: [templateId], references: [id], onDelete: SetNull)
  subscriptions Subscription[]

  @@index([isPublic])
  @@index([sortOrder])
}

// ==============================
// 2.3 订阅模板实体 (SubscriptionTemplate，v0.3.0)
// ==============================
model SubscriptionTemplate {
  id               String   @id @default(uuid())
  name             String
  description      String?
  isDefault        Boolean  @default(false)
  proxyGroupsJson  String   @default("[]")
  ruleSetsJson     String   @default("[]")
  dnsConfigJson    String   @default("{}")
  customInjectYaml String?
  customInjectJson String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  plans Plan[]

  @@index([isDefault])
}

// ==============================
// 2.4 用户订阅实例 (Subscription，v0.3.0)
// userId 唯一，保证每个用户只有一条订阅实例；生命周期由 status + expireAt 表达
// ==============================
model Subscription {
  id                String    @id @default(uuid())
  userId            String    @unique
  planId            String
  status            String    @default("ACTIVE") // ACTIVE | CANCELED | EXPIRED | REVOKED
  trafficLimitBytes BigInt
  trafficUsedBytes  BigInt    @default(0)
  startedAt         DateTime  @default(now())
  expireAt          DateTime?
  subscriptionToken String    @unique @default(uuid())
  canceledAt        DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  plan Plan @relation(fields: [planId], references: [id])

  @@index([status])
  @@index([expireAt])
}

// ==============================
// 3. 流量流水记录 (TrafficLog)
// ==============================
model TrafficLog {
  id         String   @id @default(uuid())
  nodeId     String
  userId     String
  upload     BigInt   @default(0) // 增量上传字节数
  download   BigInt   @default(0) // 增量下载字节数
  recordedAt DateTime @default(now())

  node       Node     @relation(fields: [nodeId], references: [id], onDelete: Cascade)
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([nodeId])
  @@index([userId])
  @@index([recordedAt])
}

// ==============================
// 4. 全局系统配置 (SystemSetting)
// ==============================
model SystemSetting {
  key         String   @id
  value       String   // 存储站点名称、默认配额、注册开关等 JSON 或纯文本
  description String?
  updatedAt   DateTime @updatedAt
}
```

**已启用键定义（v0.2.0）**：

| 键 | value 格式 | 缺省默认 | 用途 |
| :--- | :--- | :--- | :--- |
| `siteName` | 纯文本（1~32 字符） | `"RiriCloud"` | 站点名称，展示于登录页/注册页/侧边栏 |
| `registrationEnabled` | `"true"` / `"false"` | `"false"` | 注册开关，控制 `POST /auth/register` 与前端注册入口 |
| `defaultTrafficLimitBytes` | 十进制字符串（字节，>0） | `"107374182400"`（100 GiB） | 新建/注册用户的初始流量配额 |

读取时与默认值合并：键缺失或 value 解析失败一律回退默认值（新库无需预先 seed）；更新走 upsert（`PUT /admin/settings`，接受任意子集，见 `docs/API_AND_PROTOCOLS.md` §1.3）。

---

## 3. 核心字段与业务说明

### 3.1 `NodeInbound.paramsJson` 协议结构（v0.3.0）

系统支持 Sing-box 官方全套入站协议，采用**协议 + 传输层 (Transport) + 安全层 (TLS)** 模块化解耦设计。创建/更新时由服务端统一归一化与参数校验（`apps/server/src/common/inbound.ts`）：自动填充默认值、补全缺失密钥（Reality 密钥对 / SS 密码）。**API 输出脱敏**：管理端响应自动剥离 `privateKey`（深度合并更新确保脱敏回传不丢失私钥）。

#### 传输层 (Transport)
适用于 VLESS、VMESS、TROJAN 等支持多传输层的协议：
- `tcp`：原生流传输（默认）
- `ws`：WebSocket（`path`、`host`、`headers`、`maxEarlyData`、`earlyDataHeaderName`）
- `grpc`：gRPC（`serviceName`）
- `httpupgrade`：HTTPUpgrade（`path`、`host`、`headers`）

#### 安全层 (TLS / Reality / ACME)
- `none`：无加密明文直连
- `tls`：标准 TLS（`serverName`、`certificatePath`、`keyPath`、`alpn`、`insecure`；证书为 Agent 机本地路径）
- `reality`：VLESS Reality 伪装（`dest`、`serverNames`、`privateKey`、`publicKey`、`shortIds`）
- `acme`：Sing-box 内置 ACME 自动申请证书（`domain`、`email`、`provider`）

#### 协议专属参数结构
- **VLESS**：`flow`（如 `xtls-rprx-vision`）、`transport`、`tls`
- **VMESS**：`alterId`（默认 0）、`transport`、`tls`
- **TROJAN**：`transport`、`tls`
- **HYSTERIA2**：`upMbps`、`downMbps`、`ignoreClientBandwidth`、`obfs: { type: "salamander", password }`、`tls`
- **TUIC**：`congestionControl`（`bbr`/`cubic`/`new_reno`）、`zeroRttHandshake`、`heartbeat`、`tls`
- **SHADOWSOCKS**：`method`、`password`、`mode`（`shared` 共享单密码 / `multi-user` SS2022 多用户）
- **NAIVE**：`network`、`tls`
- **SHADOWTLS**：`version`（v2/v3）、`handshakeDest`、`password`、`strictMode`
- **MIXED / SOCKS / HTTP**：`allowLan`、`usersEnabled`
- **DIRECT**：`overrideAddress`、`overridePort`

#### 用户凭证与订阅注入规则

| 协议 | 用户标识 (User Identifier) | 密码/凭证 (Password/Credential) | 多用户模式支持 |
| :--- | :--- | :--- | :--- |
| **VLESS** | `User.uuid` | —（UUID 即凭证，支持 flow） | 是（逐用户注入） |
| **VMESS** | `User.uuid` | —（UUID + alterId 0） | 是（逐用户注入） |
| **TROJAN** | `User.email`（name） | `User.password ?? User.uuid` | 是（逐用户注入） |
| **HYSTERIA2** | `User.email`（name） | `User.password ?? User.uuid` | 是（逐用户注入） |
| **TUIC** | `User.uuid` | `User.password ?? User.uuid` | 是（逐用户注入） |
| **NAIVE** | `User.email`（username） | `User.password ?? User.uuid` | 是（逐用户注入） |
| **SHADOWSOCKS** | `User.email`（name） | 共享模式用入站密码；多用户模式用 `User.password ?? User.uuid` | 共享/多用户可选 |
| **SHADOWTLS** | — | 入站密码 | — |
| **MIXED/SOCKS/HTTP**| `User.email`（username） | `User.password ?? User.uuid`（若启用认证） | 是 |

**端口冲突规则**：同节点同传输层（TCP/UDP）端口互斥；QUIC 系协议（HYSTERIA2/TUIC）可与 TCP 协议共存于同一端口。**tag 规则**：节点内唯一；缺省按协议前缀自动生成，冲突时自动追加递增序号。

### 3.2 `Node.configOverride` 高级模式（v0.3.0）

完整 sing-box 配置的**顶层覆盖 JSON**（字符串落库，服务端校验必须为 JSON 对象）。`config_sync` 组装时与生成配置做**顶层深合并**：嵌套 plain object 按键递归合并，数组与标量整体替换（`inbounds`/`outbounds` 提供即整组替换，`log`/`route` 等按键合并）。出站与路由配置不建关系表，全部走该覆盖层。

### 3.3 `Plan` 套餐与节点匹配

`Plan` 保存用户可订购的流量配额、有效期、价格和节点授权范围：

| 字段 | 说明 |
| :--- | :--- |
| `trafficLimitBytes` | 套餐周期总流量，服务边界序列化为 Number |
| `nodeMatchMode=ALL` | 匹配所有在线且公开的节点 |
| `nodeMatchMode=TAGS` | `nodeTagsJson` 与 `Node.tagsJson` 有任一标签交集 |
| `nodeMatchMode=EXPLICIT` | 仅匹配 `nodeIdsJson` 中列出的节点 |
| `templateId` | 可选订阅模板；为空时使用全局 `isDefault=true` 模板 |

节点只有 `status=ONLINE`、`isPublic=true` 且至少有公开入站时，才会作为套餐市场的可用线路返回。订阅详情保留节点等级 `Node.level` 与标签，便于前端展示和后续权益扩展。

### 3.4 `Subscription` 生命周期与兼容镜像

每个用户通过 `userId @unique` 只有一条订阅实例。首次订购或原订阅已失效时复用/创建实例；升配立即重置已用流量并按新套餐重算周期；取消将状态置为 `CANCELED`，在 `expireAt` 前仍可使用；巡检将到期的 `ACTIVE`/`CANCELED` 更新为 `EXPIRED`；管理员可设置 `ACTIVE`、`CANCELED`、`EXPIRED`、`REVOKED`、配额、已用流量和有效期。

`User.trafficLimitBytes`、`trafficUsedBytes`、`expireAt`、`subscriptionToken` 暂时保留为兼容镜像。订阅模块存在时以 `Subscription` 为准，每次订购、升配、管理员修改或 Token 重置在同一事务中同步镜像；旧迁移/旧测试缺少订阅表时沿用原 User 配额路径。

### 3.5 `SubscriptionTemplate` 模板数据

`proxyGroupsJson` 与 `ruleSetsJson` 分别保存 Clash 策略组和分流规则数组；`dnsConfigJson` 保存 DNS/Fake-IP 设置；`customInjectYaml` 与 `customInjectJson` 是客户端配置顶层对象覆写。模板服务校验覆写语法并维护唯一默认模板，套餐未绑定模板时使用默认模板。订阅编译器对策略组支持 `select`、`url-test`、`fallback`、`load-balance` 配置输入，并按节点名称或入站 tag 正则过滤线路。
