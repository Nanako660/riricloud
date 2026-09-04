---
title: 中转线路流量统计归属与倍率计费重构
type: plan
status: completed
target_version: 0.6.2
created_at: "2026-09-04"
author: "Antigravity & Maintainers"
archived_at: "2026-09-04"
---
# 中转线路流量统计归属与倍率计费重构规划与实施任务

## 🎯 目标与背景

随着 RiriCloud 在多节点中转拓扑（盲转发 `BLIND_FORWARD`、协议重加密代理 `PROTOCOL_PROXY`、异构目标桥接 `TARGET_LINE`）的深入演进，经深入代码排查确认，当前流量统计链路存在严重缺陷，导致中转线路流量无法正确统计与计费：

1. **盲转发（`BLIND_FORWARD`）出口流量归属丢失**：
   - 机制：入口节点仅作 L4 端口盲转（Sing-box `direct` inbound），无协议解密与用户鉴权，上报用户流量恒为 0；真实用户鉴权发生在出口节点。
   - 缺陷：[`agent-gateway.service.ts`](file:///d:/1Temp/Code/riricloud/apps/server/src/agent-gateway/agent-gateway.service.ts#L297-L307) 处理心跳时硬编码仅匹配 `where: { entryNodeId: nodeId, status: 'ACTIVE' }`。出口节点的 `nodeId` 为 `exitNodeId`，匹配结果为 `null`（或误算至出口节点自身挂载的其他直连线路），写入 `TrafficLog.lineId` 为空。
   - 表现：中转线路在管理端大盘中统计流量恒为 0，跑的流量全部堆积在「未分配线路（节点直连）」或出口节点直连线路上，且无法享受中转线路设置的倍率。

2. **协议中继与异构桥接（`PROTOCOL_PROXY` / `TARGET_LINE`）出口二次扣费与首用户垫付**：
   - 机制：入口节点已对客户端真实用户完成鉴权并计费扣除配额。入口节点需要向出口节点转发流量。
   - 缺陷：[`agent-gateway.service.ts`](file:///d:/1Temp/Code/riricloud/apps/server/src/agent-gateway/agent-gateway.service.ts#L1107) 中向出口发起的出站连接硬编码借用 `const firstUser = users[0]`。出口节点将其视作真实用户，出口 Sing-box 将所有中继流量全计入 `firstUser`；Master 收到出口心跳后再次扣减 `firstUser` 的配额。
   - 表现：第一位活跃用户的额度被所有中转流量迅速耗尽，系统全站流量被统计两次。

3. **流量倍率（`trafficRate`）未参与套餐额度扣除**：
   - 缺陷：在 `persistTrafficSnapshots` 中，`totalsByUser` 直接累加物理流量 `upload + download`，未按归属线路的 `trafficRate` 进行折算扣除（仅在管理端大盘做了折算展示）。
   - 表现：高倍率或低倍率线路无法按商业规则正常扣减用户的订阅可用剩余额度。

4. **历史无 `lineId` 流水回退与数据清洗**：
   - `TrafficService.findFallbackLines` 仅索引 `entryNodeId`，导致历史数据及偶发无 `lineId` 流水在聚合时无法按盲转出口回退归属。

---

## 🏗️ 架构改动与数据流

```mermaid
flowchart TD
    subgraph BlindForward["盲转发 (BLIND_FORWARD)"]
        BF_Client[客户端] -->|访问中转入口| BF_Entry[入口节点 (L4 盲转)]
        BF_Entry -->|直接转发 TCP/UDP| BF_Exit[出口节点 (解密鉴权)]
        BF_Exit -->|上报真实用户流量| Master_BF[Master Gateway]
        Master_BF -->|智能识别 exitNodeId| BF_Line[(归属于 RELAY 线路)]
        Master_BF -->|按 RELAY 线路 trafficRate| BF_Quota[扣减用户配额]
    end

    subgraph ProtocolProxy["协议代理 / 异构桥接 (PROTOCOL_PROXY / TARGET_LINE)"]
        PP_Client[客户端] -->|访问中转入口| PP_Entry[入口节点 (解密鉴权)]
        PP_Entry -->|上报真实用户流量| Master_PP1[Master Gateway]
        Master_PP1 -->|归属于 RELAY 线路 & 按 trafficRate| PP_Quota[扣减用户配额]

        PP_Entry -.->|使用专用内部中继凭证\nrelay-transit| PP_Exit[出口节点]
        PP_Exit -->|上报 relay-transit 流量| Master_PP2[Master Gateway]
        Master_PP2 -->|识别为内部凭证| PP_Skip[仅更新 Cursor, 跳过用户计费]
    end
```

---

## 📋 里程碑与任务清单

### 里程碑 1：协议代理与异构桥接内部中转凭证（免计费通道）
- [x] 任务 1.1: 在 `apps/server/src/common/constants.ts` 或 Gateway 中定义系统专用内部中转凭证常量：
  - `INTERNAL_RELAY_TRANSIT_EMAIL = '__riricloud_relay_transit__'`
  - `INTERNAL_RELAY_TRANSIT_UUID = '00000000-0000-4000-8000-000000000002'`
  - `INTERNAL_RELAY_TRANSIT_SECRET = 'riricloud-internal-relay-transit-secret'`
- [x] 任务 1.2: 改造 `AgentGatewayService.buildProtocolRelayOutbound`，出站连接协议一律使用专用内部中继凭证，彻底移除 `users[0]` 的首用户借用逻辑。
- [x] 任务 1.3: 改造 `AgentGatewayService.buildConfigSync`：
  - `PROTOCOL_PROXY` 模式下出口入站仅配置专用内部中继凭证（不向出口入站推送普通用户凭证）；
  - `TARGET_LINE` 模式下出口直连目标入站追加内部中继凭证。
- [x] 任务 1.4: 改造 `AgentGatewayService.buildConfigSync`，在下发给 Sing-box 的 `experimental.v2ray_api.stats` 中补充 `inbounds` 列表（包含所有入站 tags），为底层入站级监控打好基础。
- [x] 任务 1.5: 改造 `AgentGatewayService.persistTrafficSnapshots`：
  - 遇到 `INTERNAL_RELAY_TRANSIT_UUID` 或内部 email 凭证时，正常更新 `TrafficCursor` 防止计数器重置告警；
  - 跳过生成 `TrafficLog`，跳过扣减 `User.trafficUsedBytes` 和 `Subscription.trafficUsedBytes`，彻底根除二次扣费与首用户垫付。

### 里程碑 2：盲转发出口智能归属与倍率扣费合一
- [x] 任务 2.1: 在 `AgentGatewayService` 中实现节点线路智能解析器 `resolveActiveLineForNode(nodeId)`：
  - 优先级 1：查找 `entryNodeId === nodeId && status === 'ACTIVE'` 的入口线路；
  - 优先级 2：若无入口线路，查找 `exitNodeId === nodeId && type === 'RELAY' && relayMode === 'BLIND_FORWARD' && status === 'ACTIVE'` 的承载盲转中继线路；
  - 返回解析出的首选线路及其 `trafficRate` 与 `id`。
- [x] 任务 2.2: 改造 `AgentGatewayService.persistHeartbeat`，使用 `resolveActiveLineForNode` 获取当前节点对应的线路 ID 与倍率，传递给 `persistTrafficSnapshots`。
- [x] 任务 2.3: 改造 `AgentGatewayService.persistTrafficSnapshots` 扣费逻辑：
  - 依据归属线路的 `trafficRate`（无归属时默认为 1.0）折算计费字节：`billedBytes = BigInt(Math.round(Number(total) * trafficRate))`；
  - 更新 `User.trafficUsedBytes` 与 `Subscription.trafficUsedBytes` 时使用 `billedBytes` 进行累加；
  - `TrafficLog` 仍记录物理原始字节 `upload` 与 `download`，并持久化 `lineId`，实现物理审计与商业计费两不误。

### 里程碑 3：大盘回退查询增强与历史数据清洗
- [x] 任务 3.1: 改造 `TrafficService.findFallbackLines`：查询字段增加 `exitNodeId`、`relayMode`。
- [x] 任务 3.2: 改造 `TrafficService.aggregate`：在构建 `fallbackByNode` 映射表时，除了 `entryNodeId` 之外，增加对 `exitNodeId`（当 `type === 'RELAY' && relayMode === 'BLIND_FORWARD'`）的索引映射，确保历史遗留无 `lineId` 的流水在图表聚合时也能准确归纳至对应中转线路。
- [x] 任务 3.3: 编写一次性数据清洗脚本 `apps/server/scripts/clean-traffic-logs.ts`：
  - 扫描现有数据库中 `lineId IS NULL` 的 `TrafficLog` 记录；
  - 对对应 `nodeId` 为单一盲转出口或直连入口的记录，安全幂等地批量回填正确的 `lineId`。

### 里程碑 4：全量自动化测试与回归保障
- [x] 任务 4.1: 补充 `agent-gateway.service.spec.ts` 单元测试：
  - 测试盲转发出口节点心跳上报正确关联中转线路；
  - 测试协议中继使用内部凭证，且心跳上报内部凭证时不计费、不扣除真实用户配额；
  - 测试线路 `trafficRate` 为 1.5x 时，套餐扣除额度为物理流量的 1.5 倍；
  - 测试计数器游标对内部凭证正常更新防止误报重置。
- [x] 任务 4.2: 补充 `traffic.service.spec.ts` 单元测试：
  - 验证盲转出口节点在 `lineId` 为空时，大盘聚合能通过 fallback 映射正确解析为中转线路。
- [x] 任务 4.3: 运行并验证历史数据清洗脚本的幂等性与执行正确性。

### 里程碑 5：文档同步、更新日志与质量门禁
- [x] 任务 5.1: 同步更新 [docs/API_AND_PROTOCOLS.md](file:///d:/1Temp/Code/riricloud/docs/API_AND_PROTOCOLS.md)（记录内部中转凭证规范与中继计费行为）。
- [x] 任务 5.2: 同步更新 [docs/DATA_MODELS.md](file:///d:/1Temp/Code/riricloud/docs/DATA_MODELS.md)（明确 `trafficRate` 在配额扣减与大盘统计中的业务口径）。
- [x] 任务 5.3: 更新 [CHANGELOG.md](file:///d:/1Temp/Code/riricloud/CHANGELOG.md) 的 `## [Unreleased]` 下登记修复条目。
- [x] 任务 5.4: 执行全量本地质量门禁：`pnpm gate`（`gate:version` + `gate:docs` + `gate:server` + `gate:web` + `gate:agent`）100% 全绿。
- [x] 任务 5.5: 任务全部完成后执行 `pnpm plan:archive docs/plans/relay-traffic-accounting.md` 归档并刷新台账。

---

## 🧪 验收标准与测试记录

- [x] 盲转发中继线路在管理端大盘（`/admin/traffic`）与单用户弹窗中正确统计出流量与折算计费量，不再归为「未分配线路」；
- [x] 协议中继/异构桥接模式下，首位用户 (`users[0]`) 额度不再被中继流量消耗，系统全局流量无二次翻倍统计；
- [x] 设定 1.5x 或 2x 流量倍率的线路，用户实际被扣除的套餐已用量严格等于物理流量乘以此倍率；
- [x] 历史 `TrafficLog` 中未分配记录被清洗修正，历史大盘数据自然回退归组；
- [x] 全量 Jest 单元测试、TypeScript 类型检查、ESLint、Go 工具链自测全绿。
