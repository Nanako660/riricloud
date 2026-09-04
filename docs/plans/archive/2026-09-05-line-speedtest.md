---
title: "线路测速功能（端到端测速、自动定时检测与延迟 Chip 标签展示）"
type: plan
status: completed
target_version: 0.5.0
created_at: "2026-09-05"
archived_at: "2026-09-05"
---
# 线路测速功能（端到端测速、自动定时检测与延迟 Chip 标签展示）实施记录

## 目标

为管理端与用户端提供线路测速功能：主控服务端执行端到端代理连通性与延迟探测（以标准 204 站点为目标，不可用时降级为入口 TCP 握手），支持后台定时自动测速及手动一键测速，并在管理端线路列表及用户侧可用线路卡片上以彩色 Chip 标签同步呈现延迟等级与诊断详情。

## 实施清单

### 数据模型与服务端
- [x] 在 `Line` 模型中增加 `lastLatencyMs`、`lastTestedAt`、`lastTestStatus`、`lastTestMessage` 字段。
- [x] 编写 Prisma 迁移文件并生成 Prisma Client。
- [x] 在 `SystemSettings` 中扩展定时测速相关配置键（开关、执行间隔、测试 URL、超时毫秒）。
- [x] 实现 `LineSpeedtestService` 核心测速服务（并发受控探测、端到端与 TCP 降级、后台定时轮询）。
- [x] 在 `LinesController` 暴露单线路即时测速与全量批量测速接口，并更新查询返回结构。
- [x] 确保用户侧 `getForUser` 线路数据同步返回最新延迟快照字段。
- [x] 编写服务端单元测试 `line-speedtest.service.spec.ts`。

### 前端（管理端与用户端）
- [x] 更新 `use-lines.ts`、`use-user-subscription.ts` API 类型与 mutations。
- [x] 新建 `LineLatencyChip` 组件，支持绿/黄/红/灰 4 档颜色及 Tooltip 悬浮详情。
- [x] 在管理端线路列表新增「延迟」数据列、顶部「全部测速」按钮及单行「测速」操作按钮。
- [x] 在管理端系统设置页面增加「线路自动测速」配置卡片。
- [x] 在用户端可用线路卡片（`LineCard`）上同步呈现延迟 Chip。

### 文档治理与质量门禁
- [x] 更新 `docs/DATA_MODELS.md`。
- [x] 更新 `docs/API_AND_PROTOCOLS.md`。
- [x] 更新 `docs/FRONTEND_UI_GUIDELINES.md` 与 `docs/VISUAL_VERIFICATION.md`。
- [x] 更新 `CHANGELOG.md` 的 `## [Unreleased]`。
- [x] 运行 `pnpm gate` 确保版本、文档、服务端、前端、Agent 五合一全绿。
- [x] 归档规划文件。
