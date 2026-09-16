---
title: "流量与系统日志存储治理（时序小时桶聚合、自动淘汰与物理分库）"
type: plan
status: active
target_version: "v0.9.1"
created_at: "2026-09-16"
author: "Antigravity & Maintainers"
---

# 流量与系统日志存储治理规划

## 🎯 目标与背景

### 1. 现状痛点定位
在当前的生产与长效运行环境中，随着管理节点增多与活跃用户累积，两大高频写入与扫描模型给主控的单文件 SQLite 带来了显著的性能瓶颈与体积失控隐患：
1. **流量记录（`TrafficLog`）秒级膨胀与内存全表扫**：
   - **秒级高频写锁**：Agent 默认每 5 秒上报一次心跳，网关在每次心跳事务中直接向 `TrafficLog` 插入增量明细。10 个节点与 50 个并发活跃用户每小时可产生上万行细碎记录。
   - **缺乏淘汰生命周期（TTL）**：现存代码中 `TrafficLog` 没有任何定时清理或淘汰逻辑，数据量与数据库文件体积只增不减。
   - **内存全量遍历聚合**：`TrafficService.getOverview` 和 `getUserDetail` 在拉取 7 天或 30 天大盘时，将查询区间内的数十万乃至数百万行原始点全量读入 Node.js 进程内存，再通过 JavaScript 循环计算小时/天级桶，内存峰值和 CPU 负载极高。
2. **系统日志（`SystemLog`）与核心业务同库争锁**：
   - `SystemLog` 与核心业务数据（`User`、`Subscription`、`Line`、`BalanceTransaction` 等）共享同一个主库（`prisma/dev.db` / `app.db`）。
   - 全量 HTTP 请求（包括高频轮询 `/api/v1/agent/poll`、健康检查与探活）默认记录 INFO 日志，写入事务频繁触碰 WAL 锁，对用户正常登录、结账与节点配额熔断造成潜在并发阻塞。

### 2. 治理目标与硬性红线
- **坚守零外部依赖红线**：严禁引入 Redis、PostgreSQL、ClickHouse、InfluxDB 等外部中间件，必须在单机轻量（NestJS + SQLite + Go Agent）架构内完全闭环。
- **账单与熔断绝对实时**：`User.trafficUsedBytes` 与 `Subscription.trafficUsedBytes` 必须随心跳事务即时扣费，超额凭据必须毫秒级触发吊销熔断，绝不受时序图表聚合延迟影响。
- **渐进式平滑演进**：
  - **第一阶段（Phase 1）**：在当前库内引入小时桶时序模型（`TrafficHourlyMetric`）、内存微批缓冲、90 天 TTL 自动淘汰、存量历史迁移与 HTTP 日志智能降噪，彻底根治写锁与内存全表扫。
  - **第二阶段（Phase 2）**：平移至物理分库架构（`main.db` 与 `telemetry.db`），彻底实现业务数据与时序/日志数据的物理隔离。

---

## 🏗️ 核心架构与技术设计

### 1. 流量存储模型重构：从「秒级明细」到「小时时序桶」
前端看板与用户画像最小粒度为 1 小时（今日/24h 视图）和 1 天（7d/30d 视图），从未直接展示秒级原始点。

#### 1.1 数据模型（`TrafficHourlyMetric`）
```prisma
model TrafficHourlyMetric {
  id          String   @id @default(uuid())
  bucketStart DateTime // UTC 小时起始时间戳（如 2026-09-16T15:00:00.000Z）
  nodeId      String
  userId      String
  lineId      String?  // 归属线路 ID（直连未分配时为 null）
  proxyKeyId  String?  // 直连代理池凭据 ID（订阅流量为 null）
  upload      BigInt   @default(0) // 当小时累计上行字节
  download    BigInt   @default(0) // 当小时累计下行字节
  billedBytes BigInt   @default(0) // 当小时累计计费字节（带倍率）
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([bucketStart, nodeId, userId, lineId, proxyKeyId])
  @@index([bucketStart])
  @@index([userId, bucketStart])
  @@index([lineId, bucketStart])
  @@index([nodeId, bucketStart])
}
```
- **唯一键复合索引**：按 `[bucketStart, nodeId, userId, lineId, proxyKeyId]` 严格防重，单个用户在单节点单线路上每小时仅占 1 行。
- **存储量级降低**：活跃数据行数下降 **99.5% 以上**，一个月 100 用户规模仅产生数万行，单次看板查询扫描行数由数十万行骤降至数十行。

#### 1.2 写入端架构：实时入账与时序微批缓冲（In-Memory Micro-Batching）
```
[Agent Heartbeat (每 5s)]
         │
         ├─── 1. 核心事务 (立即执行，0ms 延迟)
         │       ├── 更新 TrafficCursor 游标
         │       ├── 原子累加 User / Subscription / ProxyKey trafficUsedBytes
         │       └── 检查 quota.used >= limit → 立即触发超额熔断 (exhausted=true)
         │
         └─── 2. 时序看板增量 (投递至内存环形缓冲区)
                 │
                 ▼
     [TrafficHourlyMetricBuffer] (内存聚合 Map)
                 │
                 ▼ 每 10~15 秒定时器 / 进程优雅停机 Flush
     [SQLite Batch UPSERT]
     INSERT INTO "TrafficHourlyMetric" (...) VALUES (...)
     ON CONFLICT(bucketStart, nodeId, userId, lineId, proxyKeyId)
     DO UPDATE SET 
       upload = upload + excluded.upload,
       download = download + excluded.download,
       billedBytes = billedBytes + excluded.billedBytes,
       updatedAt = CURRENT_TIMESTAMP;
```

### 2. 存量数据平滑迁移与空间回收策略
1. **自动聚合归纳**：
   - 编写迁移脚本 `scripts/migrate-traffic-logs-to-hourly.ts`。
   - 通过原生 SQL 将存量 `TrafficLog` 按 `(strftime('%Y-%m-%d %H:00:00', recordedAt), nodeId, userId, lineId, proxyKeyId)` 分组求和，批量写入 `TrafficHourlyMetric`。
2. **彻底清理与物理收缩**：
   - 存量数据导入校验完毕后，清空并 DROP 掉历史巨型表 `TrafficLog`。
   - 触发一次 `VACUUM`，将已占用的磁盘空间真正退还给操作系统，主库体积恢复轻量。

### 3. 系统日志（`SystemLog`）降噪与治理
1. **HTTP 请求日志智能过滤**：
   - 默认过滤常规成功的状态码（`status < 400`）高频轮询与探活接口：
     - `/api/v1/agent/poll`（Agent 轮询）
     - `/health`、`/ping`（存活探针）
     - `/sub/*`（常规客户端定时拉取订阅，仅保留拉取计数或异常日志）
     - `/api/v1/lines/speedtest/*`（自动测速探针）
   - 异常请求（`status >= 400`）与业务关键操作（登录、改密、换绑、购买、下发配置）100% 完整保留。
2. **日志门槛参数化**：
   - `SystemSetting` 增加 `logsMinIngestLevel`（可选 `INFO`、`WARN`、`ERROR`，默认 `INFO` 但带高频端点降噪）。
   - 严格保留 `SystemLogsCleanupService` 的 7 天过期与 100,000 条最大条数兜底。

### 4. 物理分库设计（Phase 2 预备）
- `prisma/schema.prisma` -> `main.db`（核心业务：User, Node, Line, Plan, Subscription, Transaction）
- `prisma/telemetry.prisma` -> `telemetry.db`（观测时序：TrafficHourlyMetric, NodeRateMetric, SystemLog）
- 去除 `TrafficHourlyMetric` 和 `SystemLog` 对 `User` / `Node` / `Line` 的 Prisma `@relation` 外键约束，降级为普通无约束但建立索引的 String ID，扫清跨文件外键限制。

---

## 📋 里程碑与详细任务清单

### 里程碑 1：数据模型重构与小时桶建模（Phase 1 基础）
- [x] 任务 1.1: 在 `apps/server/prisma/schema.prisma` 中新增 `TrafficHourlyMetric` 模型定义，配置复合唯一约束与关联索引。
- [x] 任务 1.2: 梳理字段外键依赖，移除 `TrafficHourlyMetric` 对业务表的物理 Cascade 外键，使用显式索引，为 Phase 2 物理分库奠定解耦基础。
- [x] 任务 1.3: 执行 `prisma migrate dev --name add_traffic_hourly_metric` 生成最新迁移并生成最新 Prisma Client。
- [x] 任务 1.4: 同步更新 `docs/DATA_MODELS.md`，完善小时桶表结构、字段含义与索引说明。

### 里程碑 2：存量数据平滑迁移脚本与空间回收
- [x] 任务 2.1: 编写 `apps/server/scripts/migrate-traffic-logs-to-hourly.ts` 迁移脚本，支持将历史 `TrafficLog` 按小时粒度聚合求和并安全导入新表。
- [x] 任务 2.2: 实现迁移校验机制：对比迁移前后各用户、节点的流量总和，确保字节数 100% 账实相符。
- [x] 任务 2.3: 在迁移确认完毕后提供安全清理历史 `TrafficLog` 数据的逻辑，并执行 `PRAGMA incremental_vacuum` 或 `VACUUM` 回收磁盘空间。
- [x] 任务 2.4: 在 `scripts/clean-traffic-logs.ts` 补充小时桶修复能力或标记废弃过渡。

### 里程碑 3：网关写入端内存微批缓冲与小时桶入库
- [x] 任务 3.1: 在 `AgentGatewayService` 中构建 `TrafficHourlyMetricBuffer` 内存时序缓冲组件。
- [x] 任务 3.2: 保持核心扣费与熔断逻辑绝对实时：Agent 心跳报文解析后，立即在主事务中更新 `TrafficCursor`、`User`、`Subscription`、`ProxyKey`，超额实时熔断。
- [x] 任务 3.3: 移除每次心跳向 `TrafficLog.createMany` 插入原始行的逻辑，改为将增量投入内存缓冲队列（按 `bucketStart:nodeId:userId:lineId:proxyKeyId` 合并累加）。
- [x] 任务 3.4: 实现 10~15 秒定时微批 Flush 机制，使用高效的原生 SQL `ON CONFLICT(...) DO UPDATE` 进行增量 Upsert。
- [x] 任务 3.5: 实现 `onModuleDestroy` 优雅停机钩子，确保服务重启或正常退出时内存残余时序点 100% 刷入数据库。

### 里程碑 4：看板与统计查询层重写
- [x] 任务 4.1: 重构 `TrafficService.getOverview`：将原有抓取全量原始明细进 JS 内存循环的做法，替换为直接面向 `TrafficHourlyMetric` 的 SQL 聚合查询。
- [x] 任务 4.2: 重构 `TrafficService.getUserDetail`：直接按 `userId` 和时间范围检索对应小时记录，提升单用户流量画像接口响应性能。
- [x] 任务 4.3: 验证图表时间范围兼容性：确保 `today`、`yesterday`（小时级柱状/折线）和 `7d`、`30d`（天级合并）在前端展示完全无缝。
- [x] 任务 4.4: 完善排行榜（Line Rankings、User Rankings）算法，直接利用 SQL `GROUP BY` 求和，彻底消除大数组排序与哈希查找开销。

### 里程碑 5：自动生命周期淘汰（TTL）巡检
- [x] 任务 5.1: 创建 `TrafficCleanupService`（或在现有清理调度中扩展），设置每日低峰期定时任务。
- [x] 任务 5.2: 实现小时时序数据的 90 天滑动窗口硬淘汰（`DELETE FROM TrafficHourlyMetric WHERE bucketStart < :cutoffDate`）。
- [x] 任务 5.3: 淘汰操作按批次小事务执行（如每次 `LIMIT 5000`），避免长事务阻塞正常业务写入。

### 里程碑 6：系统日志（`SystemLog`）写入降噪与防刷
- [x] 任务 6.1: 在 `HttpLoggingInterceptor` 中完善忽略列表与智能判断，对状态码 `< 400` 的 `/api/v1/agent/poll`、`/health` 等常规高频请求静默跳过。
- [x] 任务 6.2: 订阅接口（`/sub/*`）成功请求仅以低频采样或不落库，异常拉取（401/404）完整入库供排查。
- [x] 任务 6.3: 在 `SystemSetting` 中增加日志采集门槛配置（`logsMinIngestLevel`），支持动态降级日志入库级别。

### 里程碑 7：物理分库架构落地（Phase 2 规划演进）
- [ ] 任务 7.1: 新增 `apps/server/prisma/telemetry.prisma`，将 `TrafficHourlyMetric`、`NodeRateMetric`、`SystemLog` 迁入独立的 `telemetry.db`。
- [ ] 任务 7.2: 在 `package.json` 与服务端构建脚本中增加针对 `telemetry.prisma` 的生成命令，配置独立的 `TelemetryPrismaService`。
- [ ] 任务 7.3: 配置独立环境变量 `TELEMETRY_DATABASE_URL`，支持主库与时序库物理路径解耦。
- [ ] 任务 7.4: 更新服务端模块依赖注入，`TrafficService`、`NodeRateMetric`、`SystemLogsService` 统一切换至 `TelemetryPrismaService`。
- [ ] 任务 7.5: 编写环境初始化与主控 Dockerfile/脚本适配，确保 `telemetry.db` 自动迁移并在容器中正确挂载持久化。

### 里程碑 8：测试、验证与文档门禁合规
- [x] 任务 8.1: 编写/更新 `traffic.service.spec.ts` 单元测试，覆盖小时桶计算、时间范围过滤与排行榜求和。
- [x] 任务 8.2: 编写/更新 `agent-gateway.sqlite.spec.ts` 真实 SQLite 集成测试，验证心跳增量累加、并发缓冲 Flush 与超额熔断实时性。
- [x] 任务 8.3: 运行全量端到端验证，确认 Web 界面大盘时序图、线路排行、单用户流量下钻与系统日志正常运作。
- [x] 任务 8.4: 同步更新 `docs/ARCHITECTURE.md`、`docs/DATA_MODELS.md`、`docs/API_AND_PROTOCOLS.md` 与 `docs/DEPLOYMENT_GUIDE.md`。
- [x] 任务 8.5: 在 `CHANGELOG.md` 的 `[Unreleased]` 区块登记本次治理特性与性能改进。
- [x] 任务 8.6: 运行 `pnpm gate` 确保版本、文档、后端、前端与 Agent 五合一门禁 100% 全绿。

---

## 🧪 验收标准与测试矩阵

| 模块 / 场景 | 验收标准 | 验证手段 |
| :--- | :--- | :--- |
| **实时配额熔断** | 用户产生流量时，`User` 实时扣减；触碰限额后本心跳批次立即标记 `exhausted: true` 并吊销节点凭据 | `agent-gateway.sqlite.spec.ts` 单元测试与端到端模拟 |
| **小时桶微批** | 5 秒心跳增量不会直接落单行，而是在 10~15 秒后聚合为单个小时行，复合主键无冲突 | 数据库直接 `SELECT COUNT(*)` 校验增量行数 |
| **大盘查询性能** | 模拟 30 天历史数据下，`GET /admin/traffic/overview?range=30d` 响应时间从数十毫秒甚至卡顿降低至 < 15ms，Node.js 内存无明显波动 | 基准测试脚本 / Jest 性能断言 |
| **存量数据无损** | 执行迁移脚本后，历史总上传/下载总量与原有 `TrafficLog` 汇总严格一致 | 数据核对脚本比对校验 |
| **自动淘汰有效** | 注入 91 天前的小时记录，触发清理任务后被精准删除，90 天以内记录完整保留 | 自动化定时清理测试 |
| **日志过滤降噪** | 持续调用轮询接口 100 次，`SystemLog` 表中不产生常规成功日志，发生 400/500 错误时立即入库 | API 拦截器集成测试 |

---

## 🛡️ 风险应对与回滚方案

1. **写冲突风险**：SQLite 在并发微批 Flush 时可能遇到 `SQLITE_BUSY`。
   - **应对**：继续维持当前主控的 `busy_timeout = 10000` 与单写者串行队列机制；时序 Flush 发生冲突时自动退回内存等待下一个周期重试，不丢失时序数据。
2. **存量数据迁移风险**：现有生产库如果已经包含数百万条 `TrafficLog`，在线迁移可能耗时较长。
   - **应对**：迁移脚本支持 `--batch-size 10000` 分批归纳，并在迁移前强制校验 SQLite 剩余磁盘空间，支持断点续传与事务保护。
3. **回滚机制**：
   - Phase 1 在旧表 DROP 前先行改名为 `TrafficLog_backup`，验证 48 小时生产稳定后再彻底销毁。若遇到意外问题，可随时回退代码重新读取备份表。
