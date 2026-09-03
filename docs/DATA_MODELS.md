# 数据模型设计 (Data Models)

## 1. 数据库架构设计

RiriCloud 采用 SQLite 配合 Prisma ORM 进行持久化。Master 启动时会为当前数据库显式开启 **WAL (Write-Ahead Logging)**，并设置 10 秒写锁等待上限；生产环境仍应将数据库放在本地持久化文件系统，避免网络文件系统的锁语义和延迟放大问题。

> **落地说明（v0.4.20）**：Prisma 对 SQLite 不支持 `enum` 类型，角色、节点状态、协议、线路类型、线路状态、套餐匹配模式、订阅状态、钱包流水类型与卡密状态在 `schema.prisma` 中落地为 **String 字段 + 默认值**，取值约束由应用层完成（DTO 的 class-validator 与服务层校验）。下方 schema 中的 `enum` 定义视为**逻辑枚举**，实际类型以仓库内 schema.prisma 为准。Line 顶层编排已通过迁移 `20260831100000_line_centric_pipeline` 落地。

---

## 2. 种子数据（首次启动引导）

管理员初始化与演示 seed 分离：

- 启动入口先执行 `apps/server/prisma/bootstrap-admin.js`。数据库没有 `role=ADMIN` 时，按 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 创建首个管理员；兼容 `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`，优先级为正式配置高于旧配置。已有管理员时完全跳过，不改密码，也不因邮箱配置变化创建重复账号。
- 空数据库没有管理员且未提供凭据时启动失败；管理员邮箱沿用 `class-validator` 的 `IsEmail` 规则，密码长度必须为 `8-64` 位。
- `AUTO_SEED=false`（生产默认值）迁移数据库、初始化管理员、确保内嵌默认订阅模板存在，并始终创建或复用系统保留的 `Master-Local` 本机节点；不会创建演示用户、体验套餐和线路。
- `AUTO_SEED=true` 才执行 `apps/server/prisma/seed.js`，额外幂等创建演示用户、体验套餐、VLESS/Reality 直连线路和盲转发示例线路；默认模板由通用 bootstrap 负责，完整 seed 会将其同步为内嵌模板定义，不会重复创建。本机节点由通用 bootstrap 负责，不会重复创建。重复执行不会覆盖已有管理员密码；本地 `pnpm setup` 仍通过该脚本使用演示默认凭据。
- `Master-Local` 使用 `Node.isLocal=true` 标记，是 Master 内置 Agent 的固定数据库身份。启动时复用已有 `agentToken` 与节点配置；管理端删除接口对该节点返回 `409`，防止误删内置 Agent 身份。
- 管理员密码不能通过启动环境变量隐式修改；使用 `pnpm admin:reset -- --email <email>` 或发行包 `./admin-reset.sh` 显式重置，目标账号必须已存在且角色为 `ADMIN`。

---

## 3. Prisma Schema 完整定义

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

// Agent 通信模式
enum AgentTransportMode {
  WS     // WS/WSS 长连接
  HTTP   // HTTP/HTTPS 主动轮询
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
  balance           Int          @default(0)             // 账户余额，单位为分
  
  // 流量与套餐控制
  trafficLimitBytes BigInt       @default(107374182400) // 流量配额 (默认 100GB)
  trafficUsedBytes  BigInt       @default(0)            // 已用流量 (字节)
  expireAt          DateTime?                           // 账号过期时间 (为空表示永久)
  
  // 代理与订阅凭证
  subscriptionToken String       @unique @default(uuid()) // 订阅 URL 唯一样条
  uuid              String       @unique @default(uuid()) // 用户代理凭据（底层 UUID；VLESS/VMess 等协议使用）
  password          String?                               // 用于 Shadowsocks/Hysteria2 连接密码
  
  isActive          Boolean      @default(true)          // 是否启用
  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @updatedAt

  // 关联
  trafficLogs       TrafficLog[]
  subscription      Subscription?
  balanceTransactions BalanceTransaction[]
  redeemedCodes     RedeemCode[] @relation("RedeemedCodes")

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
  isLocal         Boolean       @default(false)          // 是否为主控本机预置节点；系统节点不可删除

  // 高级模式：完整 singboxConfig 顶层覆盖 JSON（与生成配置深合并；含 inbounds 则整组替换）
  configOverride String?

  // 主从长连接通信凭证
  agentToken      String        @unique @default(uuid()) // Agent 接入认证密钥
  communicationMode AgentTransportMode @default(WS)      // 当前/期望通信模式
  pollIntervalSecs Int           @default(15)             // HTTP 轮询建议周期（秒）
  status          NodeStatus    @default(OFFLINE)        // 实时状态
  lastSeenAt      DateTime?                              // 最近心跳时间

  // 实时遥测指标
  cpuUsage        Float         @default(0)             // CPU 使用率 (0~100)
  memoryUsage     Float         @default(0)             // 内存使用率 (0~100)
  bandwidthRate   Float         @default(0)             // 实时网络速率 (bytes/s)
  uploadRate      Float?                                // 当前上行速率 (bytes/s)，旧版 Agent 未上报时为空
  downloadRate    Float?                                // 当前下行速率 (bytes/s)，旧版 Agent 未上报时为空

  // 内核状态（v0.3.0，Agent 心跳上报；旧版 Agent 不上报时保持 null）
  kernelRunning   Boolean?                               // sing-box 内核进程存活
  configError     String?                                // 最近一次配置应用失败原因（成功后清空）
  lastProbeResult String?                                // 最近一次网络探针结果 JSON（含时间、延迟、解析地址与错误）
  agentVersion   String?                                 // Agent 编译版本
  osArch         String?                                 // Agent 运行平台与架构，例如 linux/amd64
  kernelVersion  String?                                 // sing-box 内核版本

  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  // 关联；NodeInbound 仅为旧数据迁移兼容表，新线路使用 entryLines/exitLines
  inbounds        NodeInbound[]
  entryLines      Line[]        @relation("LineEntryNode")
  exitLines       Line[]        @relation("LineExitNode")
  trafficLogs     TrafficLog[]
  rateMetrics     NodeRateMetric[]

  @@index([status])
  @@index([isLocal])
}

// ==============================
// 2.1 节点速率指标实体 (NodeRateMetric，本次迭代)
// ==============================
model NodeRateMetric {
  id               String   @id @default(uuid())
  nodeId           String
  bucketStart      DateTime                         // UTC 五分钟桶起点
  sampleCount      Int      @default(0)
  uploadRateSum    Float    @default(0)             // 桶内心跳上行速率之和
  downloadRateSum  Float    @default(0)             // 桶内心跳下行速率之和
  uploadRatePeak   Float    @default(0)             // 节点桶内上行峰值
  downloadRatePeak Float    @default(0)             // 节点桶内下行峰值

  node Node @relation(fields: [nodeId], references: [id], onDelete: Cascade)

  @@unique([nodeId, bucketStart])
  @@index([nodeId, bucketStart])
  @@index([bucketStart])
}

// ==============================
// 2.2 历史节点入站实体 (NodeInbound，迁移兼容)
// 保留旧数据以便迁移与审计；新线路创建、配置下发和管理 API 均不再依赖该表。
// ==============================
model NodeInbound {
  id         String   @id @default(uuid())
  nodeId     String
  type       String   // ProtocolType: VLESS | VMESS | TROJAN | HYSTERIA2 | TUIC | SHADOWSOCKS | NAIVE | SHADOWTLS | MIXED | SOCKS | HTTP | DIRECT
  tag        String   // sing-box 入站 tag，节点内唯一
  listen     String   @default("0.0.0.0")
  port       Int
  paramsJson String   @default("{}") // 协议专属参数 JSON（结构见 §3.1）
  sortOrder  Int      @default(0)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  node Node @relation(fields: [nodeId], references: [id], onDelete: Cascade)

  @@unique([nodeId, tag])
  @@index([nodeId])
}

// ==============================
// 2.2 接入线路实体 (Line，v0.4.0)
// Node 是底座资源；Line 是面向用户订阅的唯一接入端点，并拥有协议、参数与拓扑。
// ==============================
model Line {
  id              String   @id @default(uuid())
  name            String
  tag             String?
  listen          String   @default("0.0.0.0")
  type            String   @default("DIRECT") // DIRECT | RELAY
  relayMode       String? // BLIND_FORWARD | PROTOCOL_PROXY
  protocolType    String   @default("VLESS") // ProtocolType
  paramsJson      String   @default("{}") // 协议专属参数 JSON
  entryNodeId     String
  entryPort       Int
  exitNodeId      String
  exitPort        Int
  certificateId   String? // 关联标准 TLS 证书；为空时使用 Agent 本地路径
  endpointOverrideEnabled Boolean @default(false) // 是否启用线路对外覆盖；关闭时复用底层默认设置
  serverHost      String?
  serverPort      Int?
  serverName      String?
  host            String?
  trafficRate     Float    @default(1)
  tagsJson        String   @default("[]")
  level           Int      @default(0)
  sortOrder       Int      @default(0)
  isPublic        Boolean  @default(true)
  status          String   @default("ACTIVE") // ACTIVE | DISABLED
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  entryNode     Node @relation("LineEntryNode", fields: [entryNodeId], references: [id], onDelete: Cascade)
  exitNode      Node @relation("LineExitNode", fields: [exitNodeId], references: [id], onDelete: Cascade)
  certificate   Certificate? @relation(fields: [certificateId], references: [id], onDelete: SetNull)

  @@index([entryNodeId])
  @@index([exitNodeId])
  @@index([certificateId])
  @@index([protocolType])
  @@index([type, status])
  @@index([isPublic])
  @@index([sortOrder])
}

// ==============================
// 2.2.1 TLS 证书实体 (Certificate，v0.4.15)
// PEM 私钥仅由管理员接口明文回显；普通列表与线路响应不返回私钥。
// ==============================
model Certificate {
  id             String   @id @default(uuid())
  name           String
  certificatePem String   // X.509 叶子证书 PEM
  privateKeyPem  String   // 未加密私钥 PEM
  subject        String
  issuer         String
  serialNumber   String
  sansJson       String   @default("[]")
  validFrom      DateTime
  validTo        DateTime
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  lines Line[]

  @@index([validTo])
}

// 2.3 套餐实体 (Plan，v0.4.0)
// ==============================
model Plan {
  id                String   @id @default(uuid())
  name              String
  description       String?
  price             Int      @default(0) // 最小货币单位（分）；API 的 price 使用元
  durationDays      Int
  trafficLimitBytes BigInt
  lineMatchMode     String   @default("ALL") // ALL | TAGS | EXPLICIT
  lineTagsJson      String   @default("[]")
  lineIdsJson       String   @default("[]")
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
// 2.4 订阅模板实体 (SubscriptionTemplate，v0.3.0)
// ==============================
model SubscriptionTemplate {
  id               String   @id @default(uuid())
  name             String
  description      String?
  isDefault        Boolean  @default(false)
  isBuiltin        Boolean  @default(false)
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
// 2.5 用户订阅实例 (Subscription，v0.3.0)
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
// 2.6 钱包余额流水 (BalanceTransaction，v0.4.20)
// amount 为带符号的金额，正数表示入账，负数表示扣款；每条记录保存变更前后余额。
// ==============================
model BalanceTransaction {
  id             String   @id @default(uuid())
  userId         String
  amount         Int
  balanceBefore  Int
  balanceAfter   Int
  type           String
  description    String?
  referenceId    String?
  redeemCodeId   String?  @unique
  createdAt      DateTime @default(now())

  user       User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  redeemCode RedeemCode? @relation(fields: [redeemCodeId], references: [id], onDelete: SetNull)

  @@index([userId, createdAt])
  @@index([type, createdAt])
  @@index([referenceId])
}

// ==============================
// 2.7 充值卡密 (RedeemCode，v0.4.20)
// ==============================
model RedeemCode {
  id                  String    @id @default(uuid())
  code                String    @unique
  amount              Int       // 面额，单位为分
  status              String    @default("UNUSED") // UNUSED | REDEEMED | REVOKED
  expiresAt           DateTime?
  note                String?
  redeemedAt          DateTime?
  redeemedByUserId    String?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  redeemedBy          User?              @relation("RedeemedCodes", fields: [redeemedByUserId], references: [id], onDelete: SetNull)
  balanceTransaction  BalanceTransaction?

  @@index([status, createdAt])
  @@index([expiresAt])
  @@index([redeemedByUserId])
}

// ==============================
// 3. 流量流水记录 (TrafficLog)
// ==============================
model TrafficLog {
  id         String   @id @default(uuid())
  nodeId     String
  userId     String
  lineId     String?  // 入口线路归属；历史流水或裸节点可为空
  upload     BigInt   @default(0) // 增量上传字节数
  download   BigInt   @default(0) // 增量下载字节数
  recordedAt DateTime @default(now())

  node       Node     @relation(fields: [nodeId], references: [id], onDelete: Cascade)
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  line       Line?    @relation(fields: [lineId], references: [id], onDelete: SetNull)

  @@index([nodeId])
  @@index([userId])
  @@index([lineId])
  @@index([recordedAt])
  @@index([recordedAt, lineId])
  @@index([recordedAt, userId])
}

// ==============================
// 4. 全局系统配置 (SystemSetting)
// ==============================
model SystemSetting {
  key         String   @id
  value       String   // 存储系统设置的 JSON、布尔、数字或纯文本值
  description String?
  updatedAt   DateTime @updatedAt
}
```

**已启用键定义（v0.4.8）**：

| 键 | value 格式 | 缺省默认 | 用途 |
| :--- | :--- | :--- | :--- |
| `siteName` | 纯文本（1~32 字符） | `"RiriCloud"` | 站点名称，展示于登录页/注册页/侧边栏 |
| `siteDescription` | 纯文本（≤120 字符） | `""` | 登录页和品牌区域副标题；留空时不展示 |
| `publicBaseUrl` | HTTP/HTTPS URL 或空字符串 | `""` | 全站对外访问基准地址；用于 Agent 安装、升级和二进制下载地址 |
| `logoUrl` / `faviconUrl` | URL 或空字符串 | `""` | Logo 与 Favicon 地址 |
| `siteAnnouncement` | Markdown 文本（≤10000 字符） | `""` | 用户订阅控制台公告横幅 |
| `footerCopyright` | 纯文本 | `""` | 页脚版权文案 |
| `supportTelegramUrl` / `supportDiscordUrl` / `supportCustomUrl` | URL 或空字符串 | `""` | 客服、群组与自定义支持入口 |
| `supportEmail` | 邮箱或空字符串 | `""` | 客服邮箱入口 |
| `registrationEnabled` | `"true"` / `"false"` | `"false"` | 注册开关，控制 `POST /auth/register` 与前端注册入口 |
| `defaultPlanId` | UUID 或空字符串 | `""` | 注册时自动激活的公开套餐 |
| `defaultTrafficLimitBytes` | 十进制字符串（字节，>0） | `"107374182400"`（100 GiB） | 新建/注册用户的初始流量配额 |
| `defaultBalance` | 十进制字符串（分，≥0） | `"0"` | 新用户注册初始余额；注册时写入 `SYSTEM_GIFT` 流水 |
| `defaultValidityDays` | 十进制整数（0~3650） | `"0"` | 未绑定默认套餐的新用户有效天数，0 为永久 |
| `emailDomainMode` | `none` / `whitelist` / `blacklist` | `"none"` | 注册邮箱域名过滤模式 |
| `emailDomainList` | JSON 字符串数组 | `[]` | 注册邮箱域名过滤列表 |
| `passwordMinLength` | 十进制整数（8~64） | `"8"` | 注册密码最小长度 |
| `subscriptionBaseUrl` | URL 或空字符串 | `""` | 用户端拼装订阅链接的基准地址 |
| `subscriptionShortLinksEnabled` | `"true"` / `"false"` | `"false"` | 用户端是否展示由 Nginx rewrite 提供的 UUID 伪静态订阅地址 |
| `subscriptionUpdateIntervalHours` | 十进制整数（1~168） | `"24"` | `Profile-Update-Interval` 响应头值 |
| `defaultTemplateId` | UUID 或空字符串 | `""` | 套餐未指定模板时优先使用的模板 |
| `publicLinesEnabled` | `"true"` / `"false"` | `"true"` | 全局公开线路开关 |
| `includeUsageHeaders` | `"true"` / `"false"` | `"true"` | 是否返回 `Subscription-Userinfo` |
| `heartbeatTimeoutSecs` | 十进制整数（5~3600） | `"15"` | Agent 离线判定基础超时 |
| `configSyncDebounceMs` | 十进制整数（0~10000） | `"250"` | 全量配置推送防抖延迟 |
| `defaultPollIntervalSecs` | 十进制整数（5~300） | `"15"` | 新节点与 HTTP 轮询的默认周期 |
| `binaryDownloadBaseUrl` | URL 或空字符串 | `""` | 内置 Agent/内核二进制下载基准地址 |
| `probePresetTargets` | 探针目标 JSON 数组 | TCP Apple 443 + DNS Cloudflare | 管理端探针预设目标 |
| `jwtSessionDays` | 十进制整数（1~30） | `"1"` | 新签发 JWT 的会话有效天数 |
| `customCss` | CSS 文本 | `""` | 面板运行时自定义样式 |
| `customHeadHtml` | HTML/JS 文本 | `""` | 面板 `document.head` 运行时注入代码 |

读取时与默认值合并：键缺失或 value 解析失败一律回退默认值（新库无需预先 seed）；更新走事务 upsert（`PUT /admin/settings`，接受任意子集）；重置通过删除指定覆盖键回到默认值。`defaultPlanId` 与 `defaultTemplateId` 写入时会校验关联实体，公开信息端点只返回品牌、公告、客服、订阅基准、短链接开关和前端运行时样式字段。`publicBaseUrl` 仅供主控生成 Agent 运维地址，不公开给普通用户。短链接开关不改变数据库模型，也不要求 Prisma 迁移；关闭或缺失时前端继续生成标准 `/api/v1/sub/<UUID>` 地址。

---

## 3. 核心字段与业务说明

### 3.1 `Line.paramsJson` 协议结构（v0.4.0）

系统支持 Sing-box 官方全套线路协议，采用**协议 + 传输层 (Transport) + 安全层 (TLS)** 模块化解耦设计。创建/更新 Line 时由服务端统一归一化与参数校验（`apps/server/src/common/inbound.ts`）：自动填充默认值、补全缺失密钥（Reality 密钥对 / SS 密码）。**API 输出脱敏**：线路响应自动剥离 `privateKey`，但服务端保留密钥用于 Agent 配置下发与后续深度合并。

#### 传输层 (Transport)
适用于 VLESS、VMESS、TROJAN 等支持多传输层的协议：
- `tcp`：原生流传输（默认）
- `ws`：WebSocket（`path`、`host`、`headers`、`maxEarlyData`、`earlyDataHeaderName`）
- `grpc`：gRPC（`serviceName`）
- `http`：HTTP（`path`、`host`、`headers`）
- `httpupgrade`：HTTPUpgrade（`path`、`host`、`headers`）

#### 安全层 (TLS / Reality / ACME)
- `none`：无加密明文直连
- `tls`：标准 TLS（`serverName`、`certificatePath`、`keyPath`、`certificate`、`key`、`alpn`、`insecure`）。`alpn` 为字符串数组，管理端按传输层提供预设多选：TCP/HTTP 默认 `h2` + `http/1.1`，gRPC 默认 `h2`，WebSocket/HTTPUpgrade 默认 `http/1.1`，NaiveProxy 默认 `h2`；显式空数组表示不发送 ALPN。线路关联 `Certificate` 时，服务端在生成 `config_sync` 的临时参数中以内嵌文本数组 `certificate: ["-----BEGIN CERTIFICATE-----..."]` 与 `key: ["-----BEGIN PRIVATE KEY-----..."]` 下发；未关联证书时继续使用 Agent 机本地路径。
- `reality`：VLESS Reality 伪装（`dest`、`serverNames`、`privateKey`、`publicKey`、`shortIds`）；Reality 不使用 `alpn`，管理端不展示该字段
- `acme`：Sing-box 内置 ACME 自动申请证书（`domain`、`email`、`provider`）

#### 协议专属参数结构
- **VLESS**：`flow`（如 `xtls-rprx-vision`，仅适用于启用 TLS/Reality 的入站）、`transport`、`tls`
- **VMESS**：`alterId`（默认 0）、`transport`、`tls`
- **TROJAN**：`transport`、`tls`
- **HYSTERIA2**：`upMbps`、`downMbps`、`ignoreClientBandwidth`、`obfs: { type: "salamander", password }`、`tls`
- **TUIC**：`congestionControl`（`bbr`/`cubic`/`new_reno`）、`zeroRttHandshake`（默认关闭）、`heartbeat`、`tls`
- **SHADOWSOCKS**：`method`、`password`、`mode`（`shared` 共享单密码 / `multi-user` SS2022 多用户）；SS2022 密钥必须是对应算法长度的 Base64 原始密钥（128 位为 16 字节，256 位为 32 字节），普通密码会由服务端稳定派生为合规密钥；多用户客户端密码按协议组装为 `server_password:user_password`
- **NAIVE**：`network`、`tls`
- **SHADOWTLS**：固定 v3，结构为 `version: 3`、`handshakeDest`、`strictMode`、`inner: { type: "SHADOWSOCKS", method, password }`。内层必须使用 SS2022；`password` 是内层 SS2022 服务端密钥，外层 ShadowTLS 用户密码由用户凭证注入。旧版 v2 与独立 ShadowTLS 密码结构不再接受。
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
| **SHADOWSOCKS** | `User.email`（name） | 共享模式用入站密钥；多用户 SS2022 客户端使用 `server_password:user_password`，用户密钥按 UUID 稳定派生 | 共享/多用户可选 |
| **SHADOWTLS** | v3 使用 `User.email`（name） | 外层使用用户密码；内层使用线路固定的 SS2022 服务端密钥 | v3 支持用户列表 |
| **MIXED/SOCKS/HTTP**| `User.email`（username） | `User.password ?? User.uuid`（若启用认证） | 是 |

**端口冲突规则**：同节点同传输层（TCP/UDP）端口互斥；HYSTERIA2/TUIC 视为 UDP，可与 TCP 线路共存于同一端口。Line 的入口端口和出口端口都会参与占用检查；未提供端口时，服务端从 `20000~29999` 随机生成五位端口。编辑已有 Line 会保留原端口，显式修改仍按上述规则校验。

### 3.2 `Node.configOverride` 高级模式（v0.3.0）

完整 sing-box 配置的**顶层覆盖 JSON**（字符串落库，服务端校验必须为 JSON 对象）。`config_sync` 组装时与生成配置做**顶层深合并**：嵌套 plain object 按键递归合并，数组与标量整体替换（`inbounds`/`outbounds` 提供即整组替换，`log`/`route` 等按键合并）。出站与路由配置不建关系表，全部走该覆盖层。

### 3.3 `Line` 线路与 `Plan` 匹配

`Node` 只描述底层机器、Agent 和遥测状态；历史 `NodeInbound` 仅用于旧数据兼容。`Line` 描述用户实际连接的端点，并直接持有协议、归一化参数、入口节点/端口与出口节点/端口。Agent 根据 Line 在相关节点自动派生 sing-box 入站、出站和路由规则。

| 字段 / 规则 | 说明 |
| :--- | :--- |
| `type=DIRECT` | 入口节点与出口节点相同，入口端口与出口端口相同；Agent 在该节点生成 Line 协议入站 |
| `type=RELAY` | 必须指定入口/出口节点与 `relayMode`；入口或出口端口省略时从 `20000~29999` 随机生成，并按 TCP/UDP 传输层检查冲突 |
| `tag` | 可选的入站 Tag 基础名；为空时使用 `line-<id>`，中继线路自动派生 `<tag>-entry` 与 `<tag>-exit`，同节点冲突返回 `409` |
| `listen` | 线路派生入站的监听地址，默认 `0.0.0.0`；直连和中继入口/出口复用该地址 |
| `relayMode=BLIND_FORWARD` | 入口节点生成 `direct` inbound，并用 `override_address` / `override_port` 指向出口节点的 Line 端口，保持端到端协议加密 |
| `relayMode=PROTOCOL_PROXY` | 入口节点生成 Line 协议入站、目标协议 outbound 与 route rule；出口节点生成对应协议入站 |
| `endpointOverrideEnabled=false` | 默认关闭；用户连接地址/端口复用入口节点与入口端口，SNI/Host 从 Line 协议 TLS/Transport 参数回退 |
| `endpointOverrideEnabled=true` | 启用 `serverHost/serverPort/serverName/host` 覆盖；覆盖值单独保留，关闭开关不会清空 |
| `serverHost/serverPort` | 用户端实际连接地址/端口覆盖；线路 API 顶层字段返回最终生效值，`endpointOverrides` 返回原始值 |
| `serverName/host` | 订阅编译与协议代理中继分别覆盖 SNI 与传输层 Host；开关关闭时回退到 `Line.paramsJson` |
| `protocolType/paramsJson` | Line 自己拥有协议和协议参数；响应字段为 `protocolType` + 脱敏后的 `params`，管理端通过可视化分组表单编辑 |
| `trafficRate` | 订阅展示倍率，非 1 时线路名称追加 `[Nx]` |
| `tagsJson/level/sortOrder/isPublic/status` | 线路标签、等级、排序、公开性与启停状态；只在线且公开的启用线路可进入套餐匹配 |

线路 API 为旧客户端保留只读 `targetInbound` 摘要，但它由 Line 的出口节点、出口端口和协议参数派生，不再对应 `NodeInbound` 外键。

`Plan` 保存用户可订购的流量配额、有效期、价格和线路授权范围：

| 字段 | 说明 |
| :--- | :--- |
| `trafficLimitBytes` | 套餐周期总流量，服务边界序列化为 Number |
| `lineMatchMode=ALL` | 匹配所有入口节点与出口节点均在线、且线路公开启用的线路 |
| `lineMatchMode=TAGS` | `lineTagsJson` 与 `Line.tagsJson` 有任一标签交集 |
| `lineMatchMode=EXPLICIT` | 仅匹配 `lineIdsJson` 中列出的线路 |
| `templateId` | 可选订阅模板；为空时使用全局 `isDefault=true` 模板 |

节点只提供底层健康状态；线路只有 `status=ACTIVE`、`isPublic=true` 且入口节点与出口节点均在线时，才会作为套餐市场的可用线路返回。订阅详情直接返回线路协议、倍率、等级、标签、端点覆盖和中继机制。

### 3.4 `Subscription` 生命周期与兼容镜像

每个用户通过 `userId @unique` 只有一条订阅实例。首次订购或原订阅已失效时复用/创建实例；升配立即重置已用流量并按新套餐重算周期；取消将状态置为 `CANCELED`，在 `expireAt` 前仍可使用；巡检将到期的 `ACTIVE`/`CANCELED` 更新为 `EXPIRED`；管理员可设置 `ACTIVE`、`CANCELED`、`EXPIRED`、`REVOKED`、配额、已用流量和有效期。

`User.trafficLimitBytes`、`trafficUsedBytes`、`expireAt`、`subscriptionToken` 暂时保留为兼容镜像。订阅模块存在时以 `Subscription` 为准，每次订购、升配、管理员修改或 Token 重置在同一事务中同步镜像；旧迁移/旧测试缺少订阅表时沿用原 User 配额路径。

用户流量由在线 Agent 从 Sing-box `experimental.v2ray_api` 按心跳周期上报。订阅存在时，`Subscription.trafficUsedBytes` 是计费与资格判断的真实来源，`User.trafficUsedBytes` 仅作为兼容镜像；未绑定订阅的旧用户继续使用 User 字段。`TrafficLog` 与两处已用流量更新必须在同一短事务中完成；节点实时遥测与速率聚合独立落库，历史速率桶由低频巡检按保留周期清理，不在每个心跳事务内执行删除。

### 3.5 `SubscriptionTemplate` 模板数据

`proxyGroupsJson` 与 `ruleSetsJson` 分别保存 Clash 策略组和分流规则数组；`dnsConfigJson` 保存 DNS/Fake-IP 设置；`customInjectYaml` 与 `customInjectJson` 是客户端配置顶层对象覆写。模板服务校验覆写语法并维护唯一默认模板，套餐未绑定模板时使用默认模板。订阅编译器对策略组支持 `select`、`url-test`、`fallback`、`load-balance` 配置输入，支持 `all` 动态节点展开、控制项（`DIRECT` / `REJECT`）与策略组层级引用，并按节点名称或入站 tag 正则过滤线路。

`apps/server/prisma/default-template.js` 内嵌「默认通用全能分流模板」，包含地区节点自动优选、AI/流媒体/Telegram 分流、广告拦截、国内直连、DNS/Fake-IP 与客户端覆写配置。所有部署方式的生产 bootstrap 都会确保该模板存在；如果管理员已修改模板，启动时保留修改，不覆盖内容。模板记录通过 `isBuiltin=true` 标记，只能编辑不能删除；执行完整 `prisma db seed` 时才会按内嵌定义同步模板内容。
