---
title: 系统设置梳理与全链路统一时区支持
type: plan
status: completed
target_version: v0.6.8
created_at: "2026-09-05"
author: "Antigravity & Maintainers"
archived_at: "2026-09-05"
---
# 系统设置梳理与全链路统一时区支持

## 🎯 目标与背景

1. **下线失效设置与理顺管理入口**：
   - 下线注册与用户设置中已失效的「默认流量配额」和「默认有效天数」，新用户权益统一收敛为「默认套餐」与「注册赠金」。
   - 建立全站访问 URL、订阅基准 URL、二进制分发基准 URL 的主从继承体系，主站 URL 为根基准，其余为可选独立覆盖。
   - 收敛「全局默认订阅模板」入口，系统设置中改为只读展示与跳转，集中在「订阅模板」页面维护。
   - 让「页脚版权」与「4 项客服支持渠道（Telegram/Discord/Email/自定义链接）」在前端侧边栏底部、登录页及个人中心全面落地生效。
2. **落地全链路统一系统时区（`systemTimezone`）**：
   - 系统设置中开放统一时区配置，默认为 `Asia/Shanghai`，支持常用时区与标准 IANA 时区选择。
   - 前端封装时区感知的 `formatDateTime` / `formatDate`，全局替换裸 `toLocaleDateString` / `toLocaleString`。
   - 后端自然月流量重置计算和流量统计时间桶切分统一遵循配置的系统时区。

---

## 📋 里程碑与任务清单

### 里程碑 1：服务端设置体系重构与时区支持
- [x] 任务 1.1: `SettingsService` 下线 `defaultTrafficLimitBytes` 与 `defaultValidityDays`，新增 `systemTimezone`（默认 `Asia/Shanghai`），公开 `publicBaseUrl` 与 `systemTimezone` 到 public-info。
- [x] 任务 1.2: `UpdateSettingsDto` 移除失效字段，新增 `systemTimezone` 及合法性校验。
- [x] 任务 1.3: `AuthService` 与 `UsersService` 清理对已下线配额字段的依赖，纯净初始化新用户。
- [x] 任务 1.4: `traffic-reset.ts` 与 `TrafficService` 支持 `systemTimezone`，实现自然月重置点与统计时间桶时区感知计算。
- [x] 任务 1.5: 修复并扩展后端单元测试，覆盖时区及设置读写分支。

### 里程碑 2：前端基准 URL 回退与客服版权全链路落地
- [x] 任务 2.1: `public-settings.ts` 扩展 `systemTimezone` 与 `publicBaseUrl` 强类型。
- [x] 任务 2.2: `subscription-url.ts` 优化回退逻辑：优先取 `subscriptionBaseUrl` -> 其次 `publicBaseUrl` -> 最后 `origin`。
- [x] 任务 2.3: `app-sidebar.tsx` 侧边栏底部渲染 `footerCopyright`，并增设客服支持浮窗/下拉菜单（呈现已配置的 Telegram/Discord/邮箱/自定义链接）。
- [x] 任务 2.4: 登录页（`pages/login/index.tsx`）与个人中心（`pages/user/profile/index.tsx`）接入页脚版权与客服联系渠道展示。

### 里程碑 3：前端系统设置页重构与全站时区统一格式化
- [x] 任务 3.1: 重构 `pages/admin/settings/index.tsx`：
  - 「基础与品牌」：增加「区域与时区」配置卡片，提供常用时区候选与 IANA 搜索选择器；主站 URL 强化主从继承说明。
  - 「注册与用户」：彻底移除默认流量配额与默认天数输入框。
  - 「订阅与分发」：订阅 URL 明确为覆盖项；默认模板改为只读展示与跳转管理。
  - 「Agent 运维」：二进制下载 URL 明确为覆盖项。
- [x] 任务 3.2: 在 `@/lib/utils.ts` 中封装时区感知格式化工具，全局替换全站裸 `toLocaleDateString` / `toLocaleString`。

### 里程碑 4：文档同步与门禁验证
- [x] 任务 4.1: 更新 `docs/DATA_MODELS.md` 与 `docs/API_AND_PROTOCOLS.md`。
- [x] 任务 4.2: 在 `CHANGELOG.md` 顶部的 `## [Unreleased]` 中记录变更。
- [x] 任务 4.3: 运行 `pnpm gate` 确保全绿。
- [x] 任务 4.4: 使用 `pnpm plan:archive` 归档规划文档。

---

## 🧪 验收标准与测试记录

- [x] 后端单元测试全部通过。
- [x] 前端类型检查与 Vite build 全部通过。
- [x] `pnpm gate`（五合一门禁）全绿通过。
- [x] 系统设置修改时区、版权与客服链接后，前端相关区域即时准确渲染。
- [x] 注册新用户与生成订阅链接链路顺畅无异常。
