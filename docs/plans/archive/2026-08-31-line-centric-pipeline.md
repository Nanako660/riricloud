---
title: "线路顶层编排与出入站生命周期重构 (Line-Centric Pipeline Architecture)"
type: plan
status: completed
target_version: v0.4.0
created_at: "2026-08-31"
author: "Antigravity & Maintainers"
archived_at: "2026-08-31"
---
# 线路顶层编排与出入站生命周期重构 (Line-Centric Pipeline Architecture)

## 🎯 目标与背景

基于 `/grill-me` 深度访谈达成的架构共识，将系统核心网络实体从「分散的节点底层入站」提升为**「以线路（Line）为中心的顶层编排（Top-Down Pipeline）」**：
- **节点（Node）**：回归纯算力、网络基础设施与 Agent 守护进程容器，聚焦机器指标、实时带宽与硬件健康监控。
- **线路（Line）**：作为唯一面向用户的代理业务端点，直接内聚协议配置、传输层、端口与节点流转拓扑（直连/盲转发/加密隧道）。
- **底层托管**：系统根据 Line 定义，自动为涉及节点生成配对的 Inbound/Outbound/路由规则并实时热下发，降低多页面跳跃的心智负担。

---

## 📋 里程碑与任务清单

### 里程碑 1：数据模型与数据库迁移 (Data Model & Prisma Migration)
- [x] 任务 1.1: 更新 `apps/server/prisma/schema.prisma`，将 `Line` 改造为内聚 `protocolType`、`paramsJson`、`entryNodeId`、`entryPort`、`exitNodeId`、`exitPort` 的顶层编排模型，并清理 `NodeInbound` 强绑定
- [x] 任务 1.2: 编写并执行 Prisma migration，确保数据结构平滑升级
- [x] 任务 1.3: 更新 `apps/server/prisma/seed.js` 种子脚本以适配新的 Line-Centric 数据模型

### 里程碑 2：主控后端服务重构 (Server Architecture & Config Dispatch)
- [x] 任务 2.1: 重构 `apps/server/src/lines/`（DTO、输入校验、服务层），实现直连、盲转发中继、协议代理中继的统一向导创建与端口独占分配管理
- [x] 任务 2.2: 重构 `apps/server/src/agent-gateway/agent-gateway.service.ts` 的 `buildConfigSync`，根据所有以该节点为 entry/exit 的 Line 自动派生并下发 Sing-box Inbounds/Outbounds/Route 规则
- [x] 任务 2.3: 重构 `apps/server/src/subscription/subscription.service.ts` 订阅编译器，直接读取 Line 顶层协议与端点配置生成 Clash / Sing-box / 通用订阅
- [x] 任务 2.4: 调整 `apps/server/src/nodes/`，移除独立的 Inbound CRUD 接口，新增或保留「节点承载的只读线路/端口派生列表」查询能力
- [x] 任务 2.5: 更新主控端单元与集成测试套件（`lines.service.spec.ts`、`agent-gateway.service.spec.ts`、`nodes.service.spec.ts` 等）

### 里程碑 3：Web 控制台 UI 重构 (Web Console & UX Overhaul)
- [x] 任务 3.1: 重构 `apps/web/src/pages/admin/lines/`，开发全新的「线路创建/编辑向导」弹窗（支持模式选择、节点选择、协议与 Reality/SS 参数配置、端口与端点覆盖预览）
- [x] 任务 3.2: 升级 `Line` 列表卡片与拓扑展示标签（直连 / 盲转发 / 协议代理）
- [x] 任务 3.3: 调整 `apps/web/src/pages/admin/nodes/`，移除手动「添加入站」弹窗，新增「当前承载线路与监听端口」只读卡片
- [x] 任务 3.4: 更新前端 API 客户端、类型定义与状态 hooks（`use-lines.ts`、`use-nodes.ts` 等）

### 里程碑 4：全链路联调、文档同步与质量门禁 (Verification & Governance)
- [x] 任务 4.1: 全链路集成验证（单节点直连、双节点盲转发、加密隧道、配置热下发、订阅解析与流量上报）
- [x] 任务 4.2: 同步更新设计文档（`docs/ARCHITECTURE.md`、`docs/DATA_MODELS.md`、`docs/API_AND_PROTOCOLS.md`、`docs/FRONTEND_UI_GUIDELINES.md`、`docs/VISUAL_VERIFICATION.md` 等）
- [x] 任务 4.3: 更新 `CHANGELOG.md` 的 `[Unreleased]` 段
- [x] 任务 4.4: 门禁自查（`pnpm gate:docs`、`pnpm gate:server`、`pnpm gate:web`、`pnpm gate:agent` 全绿）

---

## 🧪 验收标准与测试记录

- [x] 单节点直连线路（VLESS/Reality, Hysteria2, Shadowsocks）创建与订阅下发成功
- [x] 两节点盲转发（Blind Forward）中继线路创建与流量穿透成功
- [x] 节点页面正常显示机器指标与承载线路只读卡片
- [x] 单元测试与端到端质量门禁全绿（`pnpm gate`）

### 测试记录

- Prisma migration `20260831100000_line_centric_pipeline` 已在本地成功执行，seed 已成功执行。
- 服务端 TypeScript、ESLint、Jest 已通过（101 tests passed）。
- Web TypeScript、ESLint、Vite production build 已通过。
- Agent 的 `go vet`、`gofmt`、`go test` 与 `go build` 由 `pnpm gate:agent` 复核。
