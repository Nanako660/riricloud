---
title: "流量账务与 SQLite 写入链路优化"
type: plan
status: active
target_version: 0.5.0
created_at: 2026-09-03
---

# 流量账务与 SQLite 写入链路优化计划

## 目标与架构决策

- 保留 SQLite + WAL，不引入 PostgreSQL、Redis、MQ 或其他外部服务。
- Master 与 Agent 同步使用协议 v2；v0.5.0 发布前必须完成所有 Agent 替换，不允许新旧协议混跑。
- Agent 通过 `QueryStats(reset=false)` 上报累计流量，Master 使用按节点与凭证隔离的 `TrafficCursor` 计算增量。
- 高频 Agent 写入使用单写者队列；同节点积压遥测和累计快照只保留最新值，速率指标按五分钟桶聚合后批量写入。

## 实施清单

### 协议 v2

- [x] 增加 `protocolVersion: 2`，WS `auth_result` 和 HTTP 轮询响应返回协议版本。
- [x] 将 `trafficRecords` 替换为 `trafficSnapshots`，累计值以十进制字符串传输。
- [x] Master 拒绝 v1、缺失版本和非法累计值；Agent 校验 Master 返回的协议版本。
- [x] WS 与 HTTP 复用同一累计快照采集和 Master 账务入口。

### 流量账务

- [x] 新增 `TrafficCursor(nodeId, credential)` 模型、唯一约束、索引与 Prisma migration。
- [x] 实现首次快照、递增差额、单方向重置、相等快照和未知凭证处理。
- [x] 将 `TrafficLog`、User/Subscription 配额、`TrafficCursor` 放入同一事务。
- [x] 按用户和订阅聚合后批量更新配额，保留增量流水记录。
- [x] 使用真实 Prisma Client + SQLite 测试大整数、重复快照、并发心跳和事务链路。

### SQLite 写入调度

- [x] 增加单例 Agent 写入队列，串行化心跳、注册、回执、速率写入、巡检和清理。
- [x] 同节点心跳采用最新值覆盖，速率指标在内存中按 UTC 五分钟桶聚合。
- [x] 写入失败保留最新心跳任务，使用指数退避继续重试；记录队列等待、队列深度、慢事务和计数器重置日志。
- [x] 保留 WAL 与 `busy_timeout`，不以无限增大事务超时解决写锁争用。

### 验证与文档

- [x] 更新 API、数据模型、架构和部署文档，写明协议破坏性变更、迁移顺序和回滚要求。
- [x] 更新 `CHANGELOG.md` 的 `[Unreleased]`，开发阶段保持根版本不变。
- [x] 补充协议边界、超大整数、未知凭证、重置计数器、SQLite 并发和写入失败重试测试。
- [x] 通过 Server 类型检查、Lint、全量 Jest、Agent gofmt/go test/go vet。
- [x] 通过 Prisma schema 校验并生成最新 Client。
- [ ] 在发布分支执行 `pnpm bump minor` 固化 `0.5.0`，完成五合一门禁、Agent/Docker 构建和 Release。
- [ ] 按生产顺序替换全部 Agent、迁移 Master，观察游标和写队列指标。

## 运行与回滚

发布前备份 SQLite 主文件及对应的 `-wal`、`-shm` 文件。部署顺序为：停止旧 Agent，部署新 Agent 产物，停止旧 Master，部署并迁移新 Master，确认 Master 正常后启动全部 v0.5.0 Agent。回滚必须同时回滚 Master、Agent 并恢复数据库备份，禁止新旧协议混合运行。

## 验收记录

- Server 全量测试：27 个测试套件、218 项测试通过，包含协议边界、真实 SQLite 并发幂等和事务回滚测试。
- Agent：`go test ./...`、`go vet ./...` 通过，便携工具链版本为 Go 1.27.0。
- Prisma：schema validate、client generate 与本地 `prisma migrate deploy` 通过；迁移文件已加入仓库，生产部署使用 `prisma migrate deploy`。
