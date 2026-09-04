---
title: "重构线路端点拓扑：引入 Entry-Landing 架构并废除 exitPort"
type: plan
status: completed
target_version: v0.5.0
created_at: "2026-09-05"
author: "Antigravity & Maintainers"
archived_at: "2026-09-05"
---
# 重构线路端点拓扑：引入 Entry-Landing 架构并废除 exitPort

## 🎯 目标与背景

当前系统将线路端口统一定义为 `entryPort` 与 `exitPort`，存在核心问题：
1. **语义颠倒与歧义**：“出口端口”常被误认为访问外网的目标端口，而其本质是落地机上的服务入站监听端口。
2. **直连模式下的抽象泄露与幽灵端口**：数据库约束 `exitPort` 必填，强行要求直连线路 `exitPort === entryPort`，导致节点详情页派生两个相同端口（幽灵双重端口）以及大量冗余同步防御代码。
3. **桥接中继（TARGET_LINE）违背单一真理源**：系统重复固化目标线路端口。

基于 `/grill-me` 达成的共识，实施彻底方案：
- 数据库字段升级为 `entryNodeId`/`entryPort` + 可选的 `landingNodeId?`/`landingPort?`；
- 直连与桥接中继下落地字段为 `null`，普通中继下显式指定；
- 节点详情派生端口三态化：`DIRECT`、`TRANSIT`、`LANDING`，消灭幽灵双端口；
- REST API 纯净切换，前后端全链路、测试与文档 100% 对齐。

---

## 📋 里程碑与任务清单

### 里程碑 1：数据模型与数据库迁移 (Data Model & Prisma Migration)
- [x] 任务 1.1: 更新 `apps/server/prisma/schema.prisma`，将 `Line` 的 `exitNodeId`/`exitPort` 重构为 `landingNodeId?`/`landingPort?`，更新关联关系为 `landingNode` 与 `Node.landingLines`
- [x] 任务 1.2: 编写并应用 Prisma 数据库迁移脚本，平滑映射存量数据（直连与桥接置 NULL，普通中继映射至 landing 字段）
- [x] 任务 1.3: 更新 `apps/server/prisma/seed.js` 与 `seed-ui-traffic.js` 种子数据

### 里程碑 2：主控后端核心重塑 (Server Core & Pipeline Overhaul)
- [x] 任务 2.1: 重构 `apps/server/src/lines/dto/` 与 `lines.service.ts`，移除直连模式下的落地冗余校验，实现 TARGET_LINE 动态解析与 landingPort 分配
- [x] 任务 2.2: 重构 `apps/server/src/nodes/nodes.service.ts` 的 `servicePorts` 派生逻辑，三态化为 `DIRECT`/`TRANSIT`/`LANDING`，消除幽灵重复端口
- [x] 任务 2.3: 重构 `apps/server/src/agent-gateway/agent-gateway.service.ts` 的 `buildConfigSync` 与心跳线路匹配，对齐 landing 拓扑与 Sing-box 配置生成
- [x] 任务 2.4: 更新 `apps/server/src/traffic/traffic.service.ts` 流量聚合回退索引与 `common/line-tags.ts`
- [x] 任务 2.5: 更新主控端所有单元测试与集成测试（`lines.service.spec.ts`、`nodes.service.spec.ts`、`agent-gateway.service.spec.ts` 等）

### 里程碑 3：Web 控制台 UI 与交互重构 (Web Console & UX Overhaul)
- [x] 任务 3.1: 更新 `apps/web/src/lib/api.ts` 类型定义，全面废除 `exitNodeId`/`exitPort`，引入 `landingNodeId?`/`landingPort?`
- [x] 任务 3.2: 重构 `apps/web/src/pages/admin/lines/components/` 表单 Schema、高级设置字段与 Dialog，直连模式完全隐藏落地字段，中继模式更名为「落地节点 / 落地监听端口」
- [x] 任务 3.3: 升级线路列表（`apps/web/src/pages/admin/lines/index.tsx`）自适应拓扑展示（直连单节点，中继“中转 ➔ 落地”，桥接“中转 ➔ 目标线路”）
- [x] 任务 3.4: 升级节点详情（`apps/web/src/pages/admin/nodes/detail.tsx`）承载线路列表与派生监听端口卡片，渲染 `DIRECT`/`TRANSIT`/`LANDING` 三态标签

### 里程碑 4：全链路质量门禁、更新日志与规范归档 (Verification & Governance)
- [x] 任务 4.1: 更新 `docs/DATA_MODELS.md`、`docs/API_AND_PROTOCOLS.md`、`docs/ARCHITECTURE.md`、`docs/DEPLOYMENT_GUIDE.md` 等相关文档
- [x] 任务 4.2: 在 `CHANGELOG.md` 的 `[Unreleased]` 区块记录破坏性重构 `refactor(server)!:`
- [x] 任务 4.3: 全量执行本地五合一质量门禁（`pnpm gate`）验证全绿
- [x] 任务 4.4: 归档本任务规划（`pnpm plan:archive`）并刷新台账
