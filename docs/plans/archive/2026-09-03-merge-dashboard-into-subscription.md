---
title: 下线仪表盘并将能力全量合并至我的订阅
type: plan
status: completed
target_version: v0.4.x
created_at: "2026-09-03"
author: "Codex & Maintainers"
archived_at: "2026-09-03"
---
# 下线仪表盘并将能力全量合并至我的订阅

## 🎯 目标与背景

当前控制台中的「仪表盘」与「我的订阅」在流量、到期时间、线路和订阅链接管理上存在明显重叠。本次调整将下线前端独立仪表盘，把系统公告与客户端使用指引合并到「我的订阅」，并保留后端接口以兼容外部调用方。

## 📋 实施清单

### 前端页面与导航

- [x] 删除 `apps/web/src/pages/dashboard` 页面与独立实现。
- [x] 将登录后的根路径 `/` 使用前端 replace 重定向至 `/subscription`。
- [x] 从控制台侧边栏移除「仪表盘」，保留「我的订阅」「套餐市场」「个人中心」。
- [x] 在「我的订阅」顶部整合系统公告，支持安全 Markdown、关闭与本地记忆。
- [x] 在「我的订阅」底部整合客户端三步使用指引，并覆盖有订阅与无订阅状态。
- [x] 无有效订阅时展示开通引导卡片与前往套餐市场按钮。
- [x] 移除前端 `/api/user/dashboard` 请求与相关缓存失效逻辑。

### 后端契约与文档

- [x] 为 `GET /api/user/dashboard` 增加 `@deprecated` 文档和 Swagger 弃用标记，继续保留接口实现。
- [x] 同步更新前端规范、视觉验证台账、接口契约、架构、数据模型和路线图文档。
- [x] 在 `CHANGELOG.md` 的 `[Unreleased]` 记录本次 Changed/Removed 变更。

## 🧪 验收标准与测试记录

- [x] `pnpm gate:server` 通过。
- [x] `pnpm gate:web` 通过。
- [x] `pnpm gate:docs` 通过。
- [x] `git diff --check` 通过。
- [x] 根路径、侧边栏、订阅有状态/空状态和公告/客户端指引已完成代码级核对。
