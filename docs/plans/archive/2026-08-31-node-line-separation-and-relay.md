---
title: 节点与线路解耦、链式代理中继与主控本机节点架构重构
type: plan
status: completed
target_version: v0.4.0
created_at: "2026-08-31"
author: "Antigravity & Maintainers"
archived_at: "2026-08-31"
---
# 节点与线路解耦、链式代理中继与主控本机节点架构重构

## 🎯 目标与背景

当前 RiriCloud 架构中，底座物理服务器（Node）与面向用户的订阅输出（Inbound）紧密耦合，限制了中转隧道、端口转发、多入口复用、差异化流量倍率与链式代理等高级拓扑的实现。

本规划落地四项核心架构升级：
1. **底座节点 (Node) 与接入线路 (Line) 彻底解耦**：
   - **Node**：纯化为 VPS/物理机基础设施实体，专责 Agent 纳管、硬件遥测监控（CPU/内存/网速）、Sing-box 内核生命周期与监听端口配置（NodeInbound）。
   - **Line**：面向用户的代理接入端点（独立实体），多对一绑定 NodeInbound（或指定中继入口与出口），承载对外显示名称、公网连接地址/端口覆盖、覆盖启用开关（默认关闭并复用底层设置）、流量倍率（trafficRate）、SNI/Host 覆盖、等级、标签与启停状态。
2. **服务端中继与链式代理 (Server-side Relay / Multi-hop Chaining)**：
   - 支持创建「中继/链式线路」（`RELAY`），定义「入口节点 (Entry Node) + 转发端口」到「目标出口入站 (Target Inbound)」的链路；对外覆盖默认关闭，可按线路启用。
   - 支持两种中继机制：**盲转发/端口转发 (`BLIND_FORWARD`)**（高性能端到端加密）与 **协议重加密中继 (`PROTOCOL_PROXY`)**。
   - 主控 `config_sync` 自动协同下发中转规则，客户端透明连接。
3. **主控端本机预置为可用节点 (Master Local Node)**：
   - 系统初始化时默认预置一个 `Master-Local` 节点与专属 `agentToken`。
   - 采用对称化 Agent 架构，本地随主控拉起 `riri-agent`，主控机可天然作为中转入口机、出口机或单机代理节点。
4. **套餐 (Plan) 与订阅 (Subscription) 面向线路重构**：
   - Plan 匹配规则由节点变更为线路（`lineMatchMode`: `ALL` | `TAGS` | `EXPLICIT`）。
   - 订阅编译器（Clash Meta / Sing-box / Base64）直接从用户授权的有效 `Line` 编译输出。

---

## 📋 里程碑与任务清单

### 里程碑 1：数据模型与数据库迁移 (`apps/server/prisma`)
- [x] 任务 1.1: 更新 `schema.prisma` 中的 `Node` 模型（剥离前端展示字段，增加 `isLocal` 标识）。
- [x] 任务 1.2: 新增 `Line` 模型（字段包含 `name`, `type: DIRECT | RELAY`, `relayMode`, `entryNodeId`, `entryPort`, `targetInboundId`, `serverHost`, `serverPort`, `serverName`, `host`, `trafficRate`, `tagsJson`, `level`, `sortOrder`, `isPublic`, `status` 等）与级联外键关系。
- [x] 任务 1.3: 更新 `Plan` 模型（`nodeMatchMode`/`nodeTagsJson`/`nodeIdsJson` 升级为 `lineMatchMode`/`lineTagsJson`/`lineIdsJson`）。
- [x] 任务 1.4: 执行 Prisma Migration，生成全新迁移文件 `line_and_relay_architecture` 并通过编译。
- [x] 任务 1.5: 更新 `prisma/seed.js`，预置 `Master-Local` 本地节点与初始演示直连/中继线路。

### 里程碑 2：服务端核心业务逻辑改造 (`apps/server`)
- [x] 任务 2.1: 实现 `LinesModule`（Controller、Service、DTO），支持线路 CRUD、排序、批量启停、测试解析。
- [x] 任务 2.2: 改造 `NodesModule`，支持节点详情关联线路反查，并提供「基于入站一键派生线路」接口。
- [x] 任务 2.3: 重构 `agent-gateway` 配置下发引擎（`config_sync`）：
  - 自动扫描节点所承担的 `entryNode` 中继角色。
  - 合成 `BLIND_FORWARD` 盲转发配置（`direct` inbound with override）与 `PROTOCOL_PROXY` 协议代理转发配置。
  - 监听线路变动，250ms 防抖自动推送关联节点。
- [x] 任务 2.4: 重构 `PlansModule`，适配线路匹配（ALL / TAGS / EXPLICIT）与可用线路查询。
- [x] 任务 2.5: 重构 `SubscriptionService` 与 `builders.ts`：
  - 基于 `SubLine[]` 编译 Clash Meta YAML、Sing-box Client JSON 与 Base64 URI。
  - 支持中继线路连接目标与协议参数映射、SNI/Host 覆写与倍率标识（如 `[1.5x]`）。
- [x] 任务 2.6: 更新服务端单元测试与回归测试套件，确保全绿。

### 里程碑 3：前端界面与交互重构 (`apps/web`)
- [x] 任务 3.1: 更新统一 API 客户端（`apps/web/src/lib/api.ts`），增加 Lines API 与更新 Plan/Node 类型定义。
- [x] 任务 3.2: 新建管理员「线路管理」模块（`pages/admin/lines/`），包含：
  - 线路列表数据表格（支持按类型/状态/标签筛选、排序、搜索）。
  - 「新建/编辑线路」弹窗：支持直连与中继动态表单切换（选择入口节点、端口、中继机制、目标入站、默认关闭的覆盖开关与覆盖参数）。
  - 快捷操作：复制线路、批量启用/禁用、删除。
- [x] 任务 3.3: 改造管理员「节点管理」与「节点详情」模块（`pages/admin/nodes/`）：
  - 突出 VPS 机器监控指标、Agent 状态、内核运行情况。
  - 在入站卡片上新增「一键派生线路」快捷按钮。
  - 展示当前服务器挂载的线路反向列表。
- [x] 任务 3.4: 改造管理员「套餐管理」模块（`pages/admin/plans/`），线路匹配选择器（标签选择 / 指定线路勾选）。
- [x] 任务 3.5: 改造用户端「可用线路 / 仪表盘」（`pages/user/dashboard/`、`pages/user/lines/`），清晰展示线路倍率、等级、底层健康状态与中继标签。
- [x] 任务 3.6: 更新侧边栏导航（`app-sidebar.tsx`），挂载「线路管理」菜单。

### 里程碑 4：文档同步、质量门禁与全链路验收
- [x] 任务 4.1: 同步更新核心设计文档（`docs/ARCHITECTURE.md`、`docs/DATA_MODELS.md`、`docs/API_AND_PROTOCOLS.md`、`docs/FRONTEND_UI_GUIDELINES.md`、`docs/VISUAL_VERIFICATION.md`）。
- [x] 任务 4.2: 更新 `CHANGELOG.md` 的 `[Unreleased]` 记录。
- [x] 任务 4.3: 质量门禁自查（`pnpm gate`：`gate:docs` + `gate:server` + `gate:web` + `gate:agent` 全绿）。
- [x] 任务 4.4: 启动三端进行端到端全链路视觉验证与订阅导入验证。

---

## 🧪 验收标准与测试记录

- [x] **数据与实体正确性**：Node、NodeInbound、Line、Plan 实体关系正常，Prisma 迁移干净无告警。
- [x] **中继下发与转发**：
  - 盲转发中继生成正确的 sing-box `direct` inbound 与 override 目标。
  - 协议中继生成正确的入站与出站路由联动。
- [x] **订阅编译**：Clash Meta、Sing-box、Base64 生成包含正确连接地址、端口与 SNI 覆写。
- [x] **界面规范**：管理员与用户界面符合 shadcn/ui 规范，静态检查无错误。
- [x] **质量门禁**：`pnpm gate` 100% 通过。
- [x] **视觉验证**：在 Antigravity 代理环境下已完成 UI-23、UI-24、UI-25 等全量增量视图双主题 1440x900 走查，并生成结构化 Artifact 报告。

