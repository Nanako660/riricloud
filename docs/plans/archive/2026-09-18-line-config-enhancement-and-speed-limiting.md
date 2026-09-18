---
title: 线路管理配置项扩充与分层限速机制
type: plan
status: completed
target_version: v0.9.0
created_at: "2026-09-18"
author: "Antigravity & Maintainers"
archived_at: "2026-09-18"
---
# 线路管理配置项扩充与分层限速机制

## 🎯 目标与背景

当前 RiriCloud 已经具备成熟的直接线路、盲转中继、协议代理中继与 NAT 反向穿透隧道能力。但在多场景实际运维中，存在以下两项核心诉求：
1. **线路底层网络与高级协议项配置不够完善**：缺少 Sing-box 官方已支持的基础监听参数（如用于前置 HAProxy/Nginx 反代的 PROXY Protocol、TCP Fast Open、MPTCP、UDP 超时/分片）、多路复用（Multiplex smux/yamux/h2mux）以及协议级高级抗封锁选项（Hysteria 2 Masquerade 伪装、Shadowsocks UDP over TCP、TLS 密码与版本限制）。
2. **缺少带宽速率控制**：高防/低配 VPS 缺乏物理出站总带宽保护，同时无法针对不同价位的套餐提供差异化的带宽等级（如入门套餐 30Mbps、旗舰套餐 1000Mbps）。

本方案基于对 Sing-box 官方规范与 RiriCloud 三端架构的系统梳理，构建**线路高级配置项补全**与**分层限速（Agent 端口级 Linux tc 物理整形 + 订阅/协议级速率注入 + 节点名称标识与 UI 展示）**的完整技术落地路径。

---

## 📋 里程碑与任务清单

### 里程碑 1：数据模型与主控端契约扩展 (Prisma + DTO)
- [x] 任务 1.1: 在 `apps/server/prisma/schema.prisma` 中为 `Line` 实体扩展网络监听底座字段（`tcpFastOpen`, `tcpMultiPath`, `udpFragment`, `udpTimeout`, `proxyProtocol`, `proxyProtocolAcceptNoHeader`, `speedLimitMbps`），为 `Plan` 实体扩展 `speedLimitMbps` 与 `appendSpeedBadge` 字段，并在 `SystemSettings` 中扩展全局角标开关。
- [x] 任务 1.2: 执行 Prisma 迁移并更新 `docs/DATA_MODELS.md`。
- [x] 任务 1.3: 在 `apps/server/src/common/inbound.ts` 中升级 `InboundParams` 协议结构，完善 Multiplex、Hysteria 2 Masquerade、Shadowsocks UDP over TCP、TLS min/max version 的归一化与校验。
- [x] 任务 1.4: 升级 `CreateLineDto`、`UpdateLineDto`、`CreatePlanDto`、`UpdatePlanDto` 及应用层校验规则。

### 里程碑 2：Sing-box 服务端配置生成与 Master-Agent 同步协议
- [x] 任务 2.1: 改造 `apps/server/src/common/inbound.ts` 中的 `buildServerInbound`，生成 Sing-box 原生支持的 `shared/listen` 块、`multiplex` 块、`masquerade` 块。
- [x] 任务 2.2: 改造 `apps/server/src/agent-gateway/agent-gateway.service.ts`，在向 Agent 同步配置时，附带物理线路端口限速表 `portSpeedLimits: Record<number, number>`。
- [x] 任务 2.3: 编写服务端配置生成与参数归一化单元测试。

### 里程碑 3：Agent 边缘端 Linux tc 端口级流量整形
- [x] 任务 3.1: 在 `apps/agent` 中设计并实现 `internal/trafficshaper` 模块，封装基于 Linux `tc`（Traffic Control / HTB / TBF）的端口带宽限制器。
- [x] 任务 3.2: 实现网卡与权限自动探测、幂等规则比对与动态重载；对于非 Linux（如 Windows/macOS 开发机）或无 root/tc 权限环境平滑回退并记录 Warn 日志。
- [x] 任务 3.3: 挂接 Agent 启动、配置重载与优雅退出生命周期，确保关闭时清理自建 tc 规则。
- [x] 任务 3.4: 编写 `trafficshaper` 单元测试与 mock 测试。

### 里程碑 4：多格式订阅速率注入与角标命名策略
- [x] 任务 4.1: 在 `apps/server/src/subscription` 中实现有效速率计算：`effectiveSpeed = min(plan.speedLimitMbps, line.speedLimitMbps)`。
- [x] 任务 4.2: 在订阅生成时按全局开关与套餐覆盖策略，自动为节点名称追加格式化角标（如 `[50M]`）。
- [x] 任务 4.3: 在 Sing-box、Clash Meta/Mihomo、Hysteria 2 订阅输出中注入客户端速率参数（Hy2 `up_mbps`/`down_mbps`、Mihomo `bandwidth-limit` 等）。
- [x] 任务 4.4: 编写订阅生成与速率计算回归测试。

### 里程碑 5：Web 控制台界面与用户体验升级
- [x] 任务 5.1: 重构 `apps/web/src/pages/admin/lines/components/`：
  - 增加「网络与监听调优」配置组（TFO、MPTCP、PROXY Protocol、UDP 选项）；
  - 增加「多路复用 (Multiplex)」可视化配置项；
  - 增加「物理端口限速 (Mbps)」输入项；
  - 补充 Hysteria 2 Masquerade 与 Shadowsocks UDP over TCP 表单字段。
- [x] 任务 5.2: 升级 `apps/web/src/pages/admin/plans/components/plan-form-dialog.tsx`：
  - 增加「套餐带宽上限 (Mbps)」与「节点追加速率角标」开关。
- [x] 任务 5.3: 升级用户中心（套餐卡片、订阅详情页），美观呈现速率标签。
- [x] 任务 5.4: 在系统设置页面补充订阅角标全局开关。

### 里程碑 6：文档治理与质量门禁归档
- [x] 任务 6.1: 同步更新 `docs/API_AND_PROTOCOLS.md`、`docs/DATA_MODELS.md`、`docs/FRONTEND_UI_GUIDELINES.md`、`docs/VISUAL_VERIFICATION.md`。
- [x] 任务 6.2: 维护 `CHANGELOG.md` 顶部的 `[Unreleased]` 缓冲区。
- [x] 任务 6.3: 运行 `pnpm gate`（五合一门禁全绿自查）。
- [x] 任务 6.4: 执行 `pnpm plan:archive docs/plans/line-config-enhancement-and-speed-limiting.md` 归档。

---

## 🧪 验收标准与测试记录

- [x] 数据库迁移无损应用，旧版本线路与套餐数据无缝兼容。
- [x] Agent 接收到含端口限速配置后，在 Linux 环境下准确执行 `tc` 规则；在无权限或 Windows 环境优雅忽略无崩溃。
- [x] Hysteria 2 Masquerade 与 PROXY Protocol 配置能被 Sing-box 内核校验通过并正常启动。
- [x] 订阅导出中，节点速率角标与客户端限速参数符合 `min(plan, line)` 计算规则。
- [x] 前端表单联动完整，移动端与暗黑模式适配良好。
- [x] `pnpm gate`（version + docs + server + web + agent）全绿。
