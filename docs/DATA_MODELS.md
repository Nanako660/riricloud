# 数据模型设计 (Data Models)

## 1. 数据库架构设计

RiriCloud 采用 SQLite 配合 Prisma ORM 进行持久化。在生产环境中，SQLite 开启 **WAL (Write-Ahead Logging)** 模式，读写并发能力大幅提升。

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

// 用户角色
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
  serverPort      Int                                   // 节点对外监听端口 (如 443 / 8443)
  protocol        ProtocolType  @default(VLESS_REALITY) // 核心代理协议
  
  // 协议专用高级参数 (JSON 格式存储 Reality 私钥/公钥/SNI/ShortId 或 Hysteria2 证书配置)
  configPayload   String?                               
  
  // 主从长连接通信凭证
  agentToken      String        @unique @default(uuid()) // Agent 接入认证密钥
  status          NodeStatus    @default(OFFLINE)        // 实时状态
  lastSeenAt      DateTime?                              // 最近心跳时间
  
  // 实时遥测指标
  cpuUsage        Float         @default(0)             // CPU 使用率 (0~100%)
  memoryUsage     Float         @default(0)             // 内存使用率 (0~100%)
  bandwidthRate   Float         @default(0)             // 实时网络速率 (bytes/s)
  
  // 展示与权限
  sortOrder       Int           @default(0)             // 排序权重
  isPublic        Boolean       @default(true)          // 是否对所有普通用户公开
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  // 关联
  trafficLogs     TrafficLog[]

  @@index([status])
  @@index([isPublic])
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

---

## 3. 核心字段与业务说明

### 3.1 `Node.configPayload` 结构示例 (JSON)
对于 `VLESS_REALITY` 节点，`configPayload` 存储 Reality 握手参数：
```json
{
  "serverNames": ["www.apple.com", "gateway.icloud.com"],
  "dest": "www.apple.com:443",
  "privateKey": "...",
  "publicKey": "...",
  "shortIds": ["0123456789abcdef", ""]
}
```

对于 `HYSTERIA2` 节点：
```json
{
  "upMbps": 100,
  "downMbps": 500,
  "ignoreClientBandwidth": false
}
```
