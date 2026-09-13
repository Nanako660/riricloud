---
title: "agent-upgrade-version-reconcile"
type: plan
status: completed
target_version: v0.9.0
created_at: "2026-09-14"
author: "Antigravity & Maintainers"
archived_at: "2026-09-14"
---
# agent-upgrade-version-reconcile

## 🎯 目标与背景

**问题**：节点管理下发 Agent 升级任务后，节点详情"Agent 接入与画像"始终显示老版本，而 VPS 磁盘上的二进制已是新版本。

**根因**（分析结论）：
1. 画像 `node.agentVersion` 唯一写入口是 Agent 心跳（`persistHeartbeat`）；
2. Agent 的 `upgrade_result` 成功回执在二进制替换后、进程重启前发出，主控据此标记任务 COMPLETED；
3. Agent `restartSelf()` 为 fire-and-forget：spawn 失败时旧进程带旧版本继续心跳，主控无感知；
4. 主控升级完成后不校验"心跳上报版本 == 任务目标版本"，无任何对账机制。

**修复决策**（已确认）：
- Agent 重启策略改为**服务重启优先**（服务已安装且运行中 → `svc.Restart()`；否则/失败 → 自拉起兜底），消除 systemd 120 秒空窗与子进程竞态；
- 主控增加**升级版本对账**（心跳版本与任务目标版本比对，超时告警）+ 详情页警示横幅；
- `dispatchQueuedUpgradeTasks` 增加 60 秒重派发防抖；
- 不改 WS 协议（无新增字段，protocolVersion 保持 2），重启失败告警复用现有 `log_report` 消息。

**预期交付**：
- PR1（核心修复）：Agent 重启策略重构 + 主控版本对账 + 详情 API/前端警示 + 60s 防抖 + 测试与文档。
- PR2（后续）：自定义 URL 升级落库（`BinaryDeploymentTask.assetId/releaseId` 改可空 + 迁移 + 部署历史兼容）。

---

## 📋 里程碑与任务清单

### 里程碑 1：Agent 端重启策略重构
- [x] 任务 1.1: 新增 `apps/agent/internal/restart` 包（Restarter 接口 + 决策矩阵 + 单测）
- [x] 任务 1.2: runner 注入 restart.Manager，ws/poll client 接入并在失败路径上报 log_report
- [x] 任务 1.3: go vet / gofmt / go test / go build 通过

### 里程碑 2：主控版本对账与详情警示
- [x] 任务 2.1: agent-gateway 增加版本对账（内存 map + OnModuleInit 水合 + reconcile + 公共 getter）与 jest 复现用例
- [x] 任务 2.2: dispatchQueuedUpgradeTasks 增加 60 秒重派发防抖（含单测）
- [x] 任务 2.3: 节点详情 API 返回 `pendingVersionConfirm`（加性字段）
- [x] 任务 2.4: 节点详情"Agent 接入与画像"卡渲染升级版本未确认警示横幅

### 里程碑 3：文档同步与质量门禁
- [x] 任务 3.1: 同步 `docs/API_AND_PROTOCOLS.md`（详情响应加性字段）与 `docs/FRONTEND_UI_GUIDELINES.md`
- [x] 任务 3.2: 更新根 `CHANGELOG.md` 与 `apps/agent/CHANGELOG.md` 的 [Unreleased]
- [x] 任务 3.3: `pnpm gate` 五门禁全绿，PR1 合入 main
- [x] 任务 3.4: PR2（自定义 URL 升级落库 + Prisma 迁移 + DATA_MODELS 同步）
- [x] 任务 3.5: 100% 完成后 `pnpm plan:archive` 归档

---

## 🧪 验收标准与测试记录

- [x] 复现用例：升级成功后心跳持续上报旧版本 → 5 分钟内主控产生 WARN 系统日志，详情页出现警示横幅
- [x] 心跳上报目标版本 → INFO 确认日志、条目清除、横幅消失、画像显示新版本
- [x] 重连注册不再重发 60 秒内已派发任务（单测覆盖）
- [x] restart 决策矩阵单测：running→服务重启；未安装/出错→自拉起；服务重启失败→降级自拉起；双失败→返回错误
- [x] `pnpm gate`（version/docs/server/web/agent）全绿

## 关联

**待发布后真机验证（未完成项，不属于本规划实现任务）**：服务重启优先策略需在下一次 agent 发版并经资源中心分发后，于 Linux systemd 安装模式、免安装前台、容器（无 systemd 自动降级自拉起）三类环境各验证一次升级重启链路。

- 根因分析会话结论：回执先于重启、restartSelf 静默失败、主控无对账三者叠加。
- 发布依赖：主控对账与 UI 警示对存量旧 Agent 立即生效；Agent 侧重启策略需下次 agent 发版（`apps/agent/VERSION`）并经资源中心分发后闭环。
