# 数据模型设计 (Data Models)

## 1. 数据库架构设计

RiriCloud 采用 SQLite 配合 Prisma ORM 进行持久化。在生产环境中，SQLite 开启 **WAL (Write-Ahead Logging)** 模式，读写并发能力大幅提升。

> **落地说明（v0.1.0）**：Prisma 对 SQLite 不支持 `enum` 类型，四个枚举（`Role` / `NodeStatus` / `ProtocolType` 及后续新增）在 `schema.prisma` 中落地为 **String 字段 + 默认值**，取值约束由应用层完成（`apps/server/src/common/constants.ts` 常量枚举 + class-validator 校验）。下方 schema 中的 `enum` 定义视为**逻辑枚举**，实际类型以仓库内 schema.prisma 为准。

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

// 支持的代理协议类型
enum ProtocolType {
  VLESS_REALITY   // VLESS + Vision + Reality (推荐防封锁)
  HYSTERIA2       // Hysteria 2 (基于 UDP/QUIC 极速穿透)
  SHADOWSOCKS     // Shadowsocks (2022-blake3 标准)
  TUIC            // TUIC v5 (基于 QUIC)
}

// ==============================
// 1. 用户实体 (User)
// ==============================
model User {
  id                String       @id @default(uuid())
  email             String       @unique
  passwordHash      String
  role              Role         @default(USER)
  
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
  type       String   // ProtocolType 逻辑枚举：VLESS_REALITY | HYSTERIA2 | SHADOWSOCKS | TUIC
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

入站协议专属参数按 `type` 区分，创建/更新时由服务端归一化（`apps/server/src/common/inbound.ts`）：填充默认值、自动生成缺失密钥（Reality 密钥对 / SS 密码）、校验必填项。**API 输出脱敏**：管理端响应剥离 `privateKey`（更新时浅合并保留原值，不会因脱敏丢失）。

**VLESS_REALITY**（`serverNames/dest/shortIds/flow` 缺省回退演示默认值，密钥对缺省自动生成；`dest` 须为 `host:port`）：
```json
{
  "serverNames": ["www.apple.com"],
  "dest": "www.apple.com:443",
  "privateKey": "<32 字节裸密钥 base64url>",
  "publicKey": "<32 字节裸密钥 base64url>",
  "shortIds": ["0123456789abcdef"],
  "flow": "xtls-rprx-vision"
}
```

**HYSTERIA2**（`upMbps/downMbps` 为 0 表示不限速；TLS 证书为 **Agent 机本地路径**，主控不托管证书文件）：
```json
{
  "upMbps": 100,
  "downMbps": 500,
  "tls": {
    "serverName": "hy.example.com",
    "certificatePath": "/etc/riricloud/cert.pem",
    "keyPath": "/etc/riricloud/key.pem",
    "alpn": ["h3"],
    "insecure": false
  }
}
```

**TUIC**（`congestionControl` 缺省 `bbr`；TLS 结构同 HYSTERIA2）：
```json
{
  "congestionControl": "bbr",
  "tls": { "serverName": "…", "certificatePath": "…", "keyPath": "…", "alpn": ["h3"], "insecure": false }
}
```

**SHADOWSOCKS**（`method` 缺省 `2022-blake3-aes-128-gcm`；`password` 缺省按方法所需长度自动生成 base64 密钥。**共享密码模式**：所有用户共用入站密码，按用户流量归属在 SS 协议下不可用——按用户配额粒度本就暂缓，可接受）：
```json
{ "method": "2022-blake3-aes-128-gcm", "password": "<base64>" }
```

**用户凭证注入**（config_sync 用户列表与订阅输出保持一致）：

| 协议 | 用户标识 | 密码/凭证 |
| :--- | :--- | :--- |
| VLESS_REALITY | `User.uuid` | —（UUID 即凭证） |
| TUIC | `User.uuid` | `User.password ?? User.uuid` |
| HYSTERIA2 | `User.email`（name） | `User.password ?? User.uuid` |
| SHADOWSOCKS | —（不注入用户） | 入站共享密码 |

**端口冲突规则**：同节点同传输层（TCP/UDP）端口互斥；QUIC 系协议（HYSTERIA2/TUIC）可与 TCP 协议（VLESS_REALITY/SHADOWSOCKS）共存于同一端口。**tag 规则**：节点内唯一；缺省按协议前缀生成（`vless-in`/`hy2-in`/`ss-in`/`tuic-in`），缺省生成冲突时自动追加序号，显式指定冲突时报 409。

### 3.2 `Node.configOverride` 高级模式（v0.3.0）

完整 sing-box 配置的**顶层覆盖 JSON**（字符串落库，服务端校验必须为 JSON 对象）。`config_sync` 组装时与生成配置做**顶层深合并**：嵌套 plain object 按键递归合并，数组与标量整体替换（`inbounds`/`outbounds` 提供即整组替换，`log`/`route` 等按键合并）。出站与路由配置不建关系表，全部走该覆盖层。

> **迁移说明（v0.2.0 → v0.3.0，BREAKING）**：`Node` 删除 `serverPort`/`protocol`/`configPayload` 三列，新增 `configOverride`；新建 `NodeInbound` 表。迁移脚本把存量节点自动转为一条 `VLESS_REALITY` 入站（tag 统一 `vless-in`，端口/Reality 参数原样迁入）。旧版主控升级后需同步升级 Agent。
