---
title: 中转线路与单节点多线路流量统计归属根除修复
type: plan
status: completed
target_version: 0.6.6
created_at: "2026-09-05"
author: "Antigravity & Maintainers"
archived_at: "2026-09-05"
---
# 中转线路与单节点多线路流量统计归属根除修复

## 🎯 目标与背景

经现场真实生产数据库 `riri.db` 排查与架构对齐，确认原流量统计链路存在致命的单节点多线路竞争缺陷：
1. **首行垄断掠夺（`resolveActiveLineForNode`）**：心跳处理时按 `nodeId` 查找第一条活跃线路，导致承载多入站的节点（如国内直连与中继共存、同节点多直连）将所有流量打入首条线路，中转线路 `TrafficLog` 记录数恒为 0。
2. **Sing-box 与 Agent 缺乏入站维度**：Sing-box 原生 `user>>>` 计数器为全节点该用户累计值，不含入站端口信息。
3. **大盘活跃线路隐形**：`TrafficService.getOverview` 未对齐无流水的活跃线路，导致用量为 0 的中转线路在前端表格中彻底不可见。

本次重构采用 **「入站用户标签绑定线路」** 的彻底根治方案：在 Sing-box 入站配置层为每个用户注入包含 `lineId` 的复合标识（`${email}::${lineId}`），利用 Sing-box 原生统计实现零侵入、零客户端感知的精确归属，并改造大盘全量对齐展现。

---

## 📋 里程碑与任务清单

### 里程碑 1：入站用户复合标签注入（配置生成）
- [x] 任务 1.1: 改造 `apps/server/src/common/inbound.ts`，入站组装支持 `lineId?: string`，对非内部中转凭证将 `users[].name` 格式化为 `${user.email}::${lineId}`。
- [x] 任务 1.2: 改造 `apps/server/src/agent-gateway/agent-gateway.service.ts` 的 `buildConfigSync`，各直连、中继入口及盲转出口入站传入所属 `line.id`，并在 `experimental.v2ray_api.stats.users` 中注册复合 tags。

### 里程碑 2：复合凭证解构与精准记账（心跳处理）
- [x] 任务 2.1: 在 `AgentGatewayService` 中实现 `parseTrafficCredential`，安全拆分原始用户凭证与 `lineId`。
- [x] 任务 2.2: 改造 `AgentGatewayService.persistTrafficSnapshots`：按解析出的 `lineId` 精准落库 `TrafficLog` 并读取对应线路的 `trafficRate` 计费，废弃全局 `resolveActiveLineForNode` 盲猜。
- [x] 任务 2.3: 保留旧协议回退机制：若凭证不含 `::` 则平滑回退，确保向后兼容。

### 里程碑 3：大盘全量线路对齐与前端展示
- [x] 任务 3.1: 改造 `TrafficService.aggregate` 与 `toLineRankings`，对齐所有状态为 `ACTIVE` 的直连与中继线路，未产生流量的线路展示为 0 B / 0% 占比。
- [x] 任务 3.2: 检查前端 `TrafficRankTable`，确保 0 流量中转线路正常渲染徽章与排位。

### 里程碑 4：测试与门禁验证
- [x] 任务 4.1: 更新 `agent-gateway.service.spec.ts` 单元测试，覆盖复合凭证、多线路独立记账与倍率计算。
- [x] 任务 4.2: 更新 `traffic.service.spec.ts` 单元测试，覆盖全量线路对齐。
- [x] 任务 4.3: 执行全量 `pnpm gate`，保证门禁 100% 全绿。

---

## 🧪 验收标准与测试记录

- [x] 盲转发中继、协议中继、目标桥接中继以及同节点多直连线路均可在 `TrafficLog` 中按各自的 `lineId` 独立生成流水；
- [x] 各线路按照自身设定的 `trafficRate` 独立精准折算计费量并扣除配额，互不影响；
- [x] 管理端「线路消耗明细」大盘全量对齐所有已启用的直连和中继线路，0 流量线路显示 0 B / 0% 占比且不报错；
- [x] 全量质量门禁 `pnpm gate` 全绿通过。
