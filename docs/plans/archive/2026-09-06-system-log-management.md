---
title: "全栈可视化日志管理系统 (System Log Management)"
type: plan
status: completed
target_version: v0.6.11
created_at: "2026-09-06"
author: "Antigravity & Maintainers"
archived_at: "2026-09-06"
---
# 全栈可视化日志管理系统 (System Log Management)

## 🎯 目标与背景

构建覆盖 **Master 服务端、Web 前端与 VPS 边缘节点（Agent 与 Sing-box 内核）** 的全栈可视化日志管理系统：
- 严格遵循零外部依赖与轻量嵌入式 SQLite 架构红线；
- 采用内存队列防抖与批量异步写入，结合自动生命周期双上限滚动淘汰，防止数据库与存储膨胀；
- 建立全链路统一 `X-Request-Id`（TraceId）前后端透传，支持从前端报错/点击顺藤摸瓜排查全链路；
- 打造全功能可视化大盘（`/admin/logs`）：提供 4 大 KPI 指标卡、分级趋势堆叠图、多维复合快速筛选（级别、来源、节点、模块、状态码、TraceId、关键词、时间范围）、抽屉式元数据与调用堆栈下钻、原生 SSE 实时流推流（Live Tail）以及日志导出与清理。

---

## 📋 里程碑与任务清单

### 里程碑 1：数据模型与数据库迁移
- [x] 任务 1.1: 在 `apps/server/prisma/schema.prisma` 中增加 `SystemLog` 数据模型与多列时序复合索引
- [x] 任务 1.2: 执行 Prisma 迁移并生成客户端（`prisma migrate dev`）
- [x] 任务 1.3: 在 `docs/DATA_MODELS.md` 中同步记录 `SystemLog` 实体字段与索引规范

### 里程碑 2：服务端日志核心引擎与 API
- [x] 任务 2.1: 创建 `apps/server/src/system-logs` 模块架构
- [x] 任务 2.2: 实现 `SystemLogsService`（内存环形队列缓冲、1s/50条防抖批量持久化、多维组合查询、指标聚合、导出与清理）
- [x] 任务 2.3: 实现 `SSEHubService`（基于 RxJS Subject 的单向低延迟 SSE 实时日志推流通道）
- [x] 任务 2.4: 实现 `HttpLoggingInterceptor`（全量 API 访问拦截、`X-Request-Id` 提取透传、耗时统计、敏感字段不可逆脱敏）
- [x] 任务 2.5: 实现 `SystemLogsCleanupService`（基于系统设置的定时滚动淘汰任务）
- [x] 任务 2.6: 实现 `SystemLogsController`（REST API 与 `@Sse` 流端点）
- [x] 任务 2.7: 编写服务端单元测试套件并保证 100% 通过

### 里程碑 3：Web 前端日志上报与全功能日志中心大盘
- [x] 任务 3.1: 编写前端异常与事件采集客户端（`apps/web/src/lib/logger.ts`，全局异常拦截、Axios 拦截、Token/密码强脱敏与批量防抖上报）
- [x] 任务 3.2: 开发 `/admin/logs` 页面及子组件：
  - [x] 4 大 KPI 指标卡（`log-metrics-cards.tsx`）
  - [x] 分级趋势柱状图（`log-trend-chart.tsx`）
  - [x] 多维复合筛选栏（`log-filter-bar.tsx`）
  - [x] 高密度日志流表格（`log-table.tsx`）
  - [x] 日志详情与堆栈侧滑抽屉（`log-detail-drawer.tsx`）
  - [x] SSE Live Tail 实时推流控制器（`log-live-tail-bar.tsx`）
  - [x] 日志清理与安全模态框（`log-cleanup-dialog.tsx`）
- [x] 任务 3.3: 注册管理侧边栏导航与路由

### 里程碑 4：边缘 Agent 智能上报与实时推流联动
- [x] 任务 4.1: 在 `apps/server/src/agent-gateway` 支持接收 Agent 上报的日志并交由 `SystemLogsService`
- [x] 任务 4.2: 在 `apps/agent` 增加 WARN/ERROR 自动向 Master 上报及 SSE 实时推流指令处理

### 里程碑 5：文档同步、归档与五合一质量门禁
- [x] 任务 5.1: 同步更新 `docs/API_AND_PROTOCOLS.md` 与 `docs/FRONTEND_UI_GUIDELINES.md`
- [x] 任务 5.2: 更新 `CHANGELOG.md` 顶部的 `## [Unreleased]` 缓冲区
- [x] 任务 5.3: 执行 `pnpm gate`（version, docs, server, web, agent）确保五门禁全绿
- [x] 任务 5.4: 任务完成后使用 `pnpm plan:archive` 归档此规划

---

## 🧪 验收标准与测试记录

- [x] `SystemLog` 批量入库不阻塞 HTTP 响应，SQLite 写入抗并发稳定
- [x] 全链路 `X-Request-Id` 在前端、API 拦截器与日志记录中完全一致
- [x] 密码、Bearer Token、Cookie 等敏感字段在入库与推流中已被彻底脱敏
- [x] 前端未捕获异常与 API 错误可自动上报并清晰展示调用堆栈
- [x] Live Tail SSE 实时推流可一键暂停、恢复、滚动与清屏
- [x] `pnpm gate` 五合一门禁全绿通过
