---
title: "Sing-box 日志采集与系统日志降噪优化"
type: plan
status: completed
target_version: v0.8.15+
created_at: "2026-09-17"
author: "Codex & Maintainers"
archived_at: "2026-09-17"
---
# Sing-box 日志采集与系统日志降噪优化

## 🎯 目标与背景

将系统日志从 Sing-box 原始 stdout/stderr 查看器调整为运维事件与异常日志中心，默认只保留真实 WARN/ERROR，并通过受控的 30 分钟诊断模式临时采集 INFO/DEBUG。流量统计继续由 StatsService、heartbeat 与小时桶负责。

## 📋 里程碑与任务清单

### 里程碑 1：Agent 解析与采集策略
- [x] 解析 ANSI、真实日志级别、stdout/stderr 元数据与 ACCESS 分类。
- [x] NORMAL 模式过滤 INFO/DEBUG/ACCESS，INFO/DEBUG 诊断模式按级别放行。
- [x] 保留 Agent 结构化生命周期日志，补充异常退出/配置失败事件。
- [x] 实现 60 秒内重复 WARN 合并与 repeatCount，保留 ERROR、环形缓冲和批量上报机制。
- [x] WS/HTTP 配置下发与心跳能力声明支持 Sing-box 日志采集策略。

### 里程碑 2：Master、数据模型与协议
- [x] Node 增加 singboxLogMode 与 singboxLogModeUntil，并完成 Prisma 迁移。
- [x] NORMAL 默认生成 log.level=warn，诊断模式只覆盖 log.level 并保留其他 configOverride 字段。
- [x] config_sync 与 HTTP poll 增加可选 singboxLogCaptureLevel 字段。
- [x] 新增管理员开启/停止诊断 API，校验在线状态与 singbox_log_capture 能力。
- [x] 实现 30 分钟固定过期、30 秒巡检、缓存清理、WS 推送/HTTP 下次 poll 生效和结构化审计日志。
- [x] 实现服务端二次拦截、诊断级别受控绕过全局门槛、ANSI/主机信息/凭据脱敏。

### 里程碑 3：Web、测试与文档
- [x] 节点详情增加 INFO/DEBUG 诊断开关、重启/隐私提示、倒计时、停止和状态展示。
- [x] 系统日志显示真实级别与重复次数，并说明 WARN/ERROR 指标与流量统计口径。
- [x] 补充 Agent、Server、Web 相关单元测试与 SQLite fixture 字段。
- [x] 更新 API、数据模型、架构、前端规范、视觉验证台账、CHANGELOG 与 Agent 更新日志。
- [x] 检索 E2E/config_sync/poll/Agent 重启链路，确认无需调整现有 fixture。
- [x] 完成版本、文档、Server、Web、Agent 全量质量门禁。

## 🧪 验收标准与测试记录

- [x] `pnpm gate` 全部通过：Server 63 suites / 529 tests，Web lint/build，Agent go test/vet/build。
- [x] 视觉验证台账已更新；实际视觉验证按项目约束需在 Antigravity 环境执行，未接入 CI/Git Hook。
- [x] 未迁移历史日志、未改变流量统计模型、未引入 Redis/外部数据库或重型测试框架。