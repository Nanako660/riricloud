---
title: 多设备同时在线限制与实时设备管理全链路实现
type: plan
status: completed
target_version: v0.9.0
created_at: "2026-09-25"
author: Maintainers
archived_at: "2026-09-25"
---
# 多设备同时在线限制与实时设备管理全链路实现

## 目标与约束

实现套餐默认、用户覆盖和全局开关三级设备并发策略，并提供 Agent 实时 IP 采集、跨节点去重与超限断连，以及用户和管理员在线设备管理。

- `Plan.deviceLimit`：0~1000，默认 0 表示不限。
- `User.deviceLimit`：`null` 跟随生效套餐、0 显式不限、正数覆盖套餐。
- 兑换订阅的 `planSnapshotJson.deviceLimit` 优先于当前套餐值；`deviceLimitEnabled=false` 只停用自动限制，不清除配置，手动踢设备仍可用。
- `deviceOnlineWindowSecs`：15~600 秒，默认 60 秒。Master 在线报告仅驻留内存，按用户与客户端 IP 跨节点去重。
- Agent 每 2 秒查询 Sing-box loopback Clash API；内核连接元数据通过仓库维护的上游源码 patch 暴露 inbound user。短连接可能落在采样间隔之间而未被观察到。
- 新增 WS/HTTP poll 字段均可选，保持旧 Agent 向后兼容；设备追踪能力通过 `device_tracking` 声明。

## 里程碑与任务清单

### 1. 策略数据与设置
- [x] 为 `User`、`Plan` 增加设备限制字段并提供 SQLite 迁移，更新数据模型文档。
- [x] 增加有效限制解析、来源字段与全局设置（含范围校验和默认值），覆盖纯函数及设置服务测试。
- [x] 将限制纳入套餐 DTO/API、订阅套餐快照与公开套餐展示契约。

### 2. Master / Agent 设备追踪与协议
- [x] Agent 增加本机 Clash API 连接采集、按用户/IP/线路聚合、保留最早设备及踢设备冷却，并接入 Sing-box 生命周期。
- [x] 为构建的 Sing-box 源码幂等应用 `inboundUser` patch，并在 Master 下发 loopback Clash API 配置。
- [x] Agent WS 与 HTTP poll 支持在线设备报告、限制同步、踢设备任务和结果回执。
- [x] Master 实现在线报告过期、跨节点 IP 去重、全局有效限制同步、超限断连和按 IP/全部手动踢设备。
- [x] 提供用户/管理员设备查询与踢设备 REST API；用户列表返回在线数和有效策略摘要。
- [x] 补充 Agent、Master 策略及网关的自动化回归测试；核对 `scripts/dev-e2e*` 和 fixtures 的兼容性，必要更新同步补测。

### 3. Web 管理与用户体验
- [x] 系统设置页提供全局限制开关与在线窗口配置。
- [x] 套餐表单、套餐列表与公开商城卡片展示并维护套餐设备上限。
- [x] 管理端用户表单支持跟随套餐/不限/指定上限，用户列表展示在线设备与策略，并支持设备查询、单台或全部踢下线。
- [x] 用户订阅页展示在线设备数与上限，并支持设备查询、单台或全部自助踢下线。
- [x] 新增 UI 文案仅录入 `zh-CN` 基准字典并通过 `t(...)` 使用；更新视觉验证索引台账。

### 4. 文档、门禁与归档
- [x] 同步 API/WS/poll、数据模型、架构、部署要求、视觉验证索引及 `[Unreleased]` 更新日志。
- [x] 执行 `pnpm gate`（version、docs、i18n、server、web、agent）并修复本次变更导致的失败。
- [x] 所有实现任务和可执行自动化验收完成后，执行 `pnpm plan:archive multi-device-limit-and-management.md`。

## 验收口径与环境限制

- 有效上限遵守用户覆盖 > 套餐（兑换快照优先）> 不限；全局关闭仅停用自动限制。
- 在线报告按配置窗口过期，跨节点同一用户/IP 只计一个设备；超限处理保留较早上线设备，并能手动按 IP 或全部踢下线。
- REST、WS 与 HTTP poll 字段有 DTO/运行时校验及自动化测试；可选字段不要求旧 E2E fixture 改动时，在自查中说明依据。
- 管理端和用户端页面/文案完成并通过 Web 构建与 i18n 门禁。
- 本任务环境不是 Antigravity；按仓库规定不执行视觉走查。受影响的 `UI-11`、`UI-13`、`UI-14`、`UI-16`、`UI-17`、`UI-20`、`UI-21`、`UI-39` 已登记，实际截图视觉复验仍待 Antigravity 环境按需完成，不接入 CI 或 Git Hook。

## 执行记录

- 2026-09-25：`pnpm gate` 全部通过（version、docs、i18n、server、web、agent）；Server 70 suites / 603 tests 通过，Web lint/type/build 通过，Agent go vet/test/build 通过。
- E2E 评估：新增设备字段均为可选；已同步支持新增 poll 字段的脚本，fixture 无需额外契约变更。
- 视觉验证：遵守环境限制，未在当前 Codex 环境执行；索引台账已注明待 Antigravity 复验。