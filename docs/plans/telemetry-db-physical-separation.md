---
title: "时序遥测与日志物理分库隔离（Phase 2 架构演进）"
type: plan
status: active
target_version: "v0.9.2"
created_at: "2026-09-17"
author: "Antigravity & Maintainers"
---

# 时序遥测与日志物理分库隔离规划（Phase 2）

## 🎯 目标与背景

### 1. 前情与背景
在 Phase 1（已归档规划 [2026-09-17-traffic-and-log-storage-governance.md](./archive/2026-09-17-traffic-and-log-storage-governance.md)）中，系统已全面落地小时桶时序模型（`TrafficHourlyMetric`）、内存微批缓冲队列、90 天 TTL 自动淘汰与 HTTP 日志智能降噪，单次大盘扫描行数与写锁竞争降低了 99.5% 以上，并去除了时序与日志对业务表的物理外键约束，为物理分库扫清了技术障碍。

### 2. 本阶段目标
在后续超大规模节点与高并发运营场景下，进一步将时序遥测数据（`TrafficHourlyMetric`、`NodeRateMetric`）与系统日志（`SystemLog`）从核心业务数据库（`app.db` / `dev.db`）中剥离，迁移至独立的物理数据库文件 `telemetry.db`：
1. **物理读写完全隔离**：时序批量写入与日志高频查询仅持有 `telemetry.db` 的 WAL 锁，主业务库（`User`、`Subscription`、`Line`、`BalanceTransaction` 等）永远不受大盘统计或日志刷新的任何锁干扰。
2. **独立备份与归档**：管理员可根据运维策略单独备份核心主库（仅数十 KB ~ 几 MB，极其轻量），而 `telemetry.db` 可根据需要独立挂载高速磁盘、丢弃或单独重建。
3. **坚守零外部依赖**：依然维持双单文件 SQLite 架构，不引入外部数据库与独立中间件。

---

## 🏗️ 核心架构与技术设计

```
[Master Service]
       │
       ├──► PrismaService (主业务库: apps/server/prisma/schema.prisma -> app.db)
       │       └── User, Plan, Subscription, Line, Node, Transaction, SystemSetting...
       │
       └──► TelemetryPrismaService (时序观测库: apps/server/prisma/telemetry.prisma -> telemetry.db)
               └── TrafficHourlyMetric, NodeRateMetric, SystemLog
```

- 主库与观测库通过环境变量 `DATABASE_URL` 与 `TELEMETRY_DATABASE_URL` 分别指定文件路径。
- `TelemetryPrismaService` 扩展独立的 Prisma 客户端实例，并配置独立的 `WAL` 模式与 `busy_timeout`。

---

## 📋 里程碑与任务清单

### 里程碑 1：Prisma 多 Schema 架构支持（`telemetry.prisma`）
- [ ] 任务 1.1: 新增 `apps/server/prisma/telemetry.prisma`，包含 `TrafficHourlyMetric`、`NodeRateMetric`、`SystemLog` 模型定义。
- [ ] 任务 1.2: 从 `apps/server/prisma/schema.prisma` 中移除上述观测模型，保留纯业务模型。
- [ ] 任务 1.3: 在 `package.json` 与构建脚本中增加针对 `telemetry.prisma` 的生成与迁移命令（如 `prisma:telemetry:generate` 与 `prisma:telemetry:deploy`）。

### 里程碑 2：服务端模块注入解耦与双 Prisma 客户端架构
- [ ] 任务 2.1: 构建 `TelemetryPrismaService` 并注册至独立模块 `TelemetryPrismaModule`。
- [ ] 任务 2.2: 更新 `TrafficService`、`TrafficCleanupService`、`AgentGatewayService` 时序缓冲，切换至 `TelemetryPrismaService`。
- [ ] 任务 2.3: 更新 `SystemLogsService`、`SystemLogsCleanupService`，切换至 `TelemetryPrismaService`。
- [ ] 任务 2.4: 更新单测与集成测试 Mock 注入，确保测试套件全面兼容双服务。

### 里程碑 3：部署环境持久卷与自动迁移脚本适配
- [ ] 任务 3.1: 更新 `scripts/docker-entrypoint.js` 与 `scripts/master-bundle/start.sh`，启动时依次执行两个库的 `migrate deploy`。
- [ ] 任务 3.2: 升级 `apps/server/package.json` 的 `start:prod` 脚本支持双库迁移。
- [ ] 任务 3.3: 编写由单库平滑拆分为双库的存量物理迁移脚本（安全将已有数据搬移至 `telemetry.db` 并收缩主库）。

### 里程碑 4：测试、验证与文档门禁合规
- [ ] 任务 4.1: 执行端到端与 SQLite 集成测试，验证主业务与时序遥测并发无冲突。
- [ ] 任务 4.2: 同步更新 `docs/DATA_MODELS.md`、`docs/ARCHITECTURE.md` 与 `docs/DEPLOYMENT_GUIDE.md`。
- [ ] 任务 4.3: 运行 `pnpm gate` 确保全仓门禁通过并归档本规划。

---

## 🧪 验收标准与测试记录

- [ ] 单元测试与端到端测试全绿通过
- [ ] 双物理文件 `app.db` 与 `telemetry.db` 独立生成，WAL 互不影响
- [ ] 存量升级与全新部署无缝兼容
