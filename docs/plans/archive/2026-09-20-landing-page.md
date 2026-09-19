---
title: "首屏落地页（Landing Page）与可配置化设计落地"
type: plan
status: completed
target_version: v0.8.20
created_at: "2026-09-20"
author: "Antigravity & Maintainers"
archived_at: "2026-09-20"
---
# 首屏落地页（Landing Page）与可配置化设计落地

## 🎯 目标与背景

为 RiriCloud 引入一个符合 **shadcn/ui 官方生态标准** 与 **New York 极简视觉规范** 的现代化首屏落地页。系统提供出色的开箱即用美感与完整的多模块自由配置能力，未登录访客可直观了解系统特性、公开套餐与客服支持；已登录用户访问可无缝直达控制台；管理员可通过独立的「首屏设置」进行模块控制与内容的可视化增删改。同时同步完善中英双语 i18n 设计。

---

## 📋 里程碑与任务清单

### 里程碑 1：后端系统设置扩展与单测
- [x] 任务 1.1: 在 `SystemSettings` 扩展首屏配置字段并在 `PublicSystemSettings` 中导出
- [x] 任务 1.2: 在 `update-settings.dto.ts` 中补充校验
- [x] 任务 1.3: 补充 `settings.service.spec.ts` 服务层单测

### 里程碑 2：前端首屏落地页设计与模块组件落地
- [x] 任务 2.1: 落地页类型定义与高质量中英双语默认内容（特性与 FAQ）
- [x] 任务 2.2: 顶栏 `LandingHeader`（shadcn 规范、毛玻璃粘性顶栏、平滑锚点滚动、双语与主题切换、智能登录/控制台状态适配）
- [x] 任务 2.3: `HeroSection`（徽章 Badge、大标题、副标语、CTA 按钮组、技术标签微指标）
- [x] 任务 2.4: `FeaturesSection`（响应式特性卡片网格，支持后台覆盖）
- [x] 任务 2.5: `PricingSection`（对接 `/api/plans/public` 渲染公开套餐与购买导流）
- [x] 任务 2.6: `FaqSection`（基于 `<Accordion>` 的常见问答折叠）
- [x] 任务 2.7: `LandingFooter`（版权信息与客服社交链接）
- [x] 任务 2.8: 组装落地页主视图 `LandingPage`，挂载至根路径 `/` 并实现智能开关判断与回退导航

### 里程碑 3：管理后台「首屏设置」Tab 与可视化管理
- [x] 任务 3.1: 制作 `LandingSettingsTab`，包含总开关、模块显隐、Hero 标语配置
- [x] 任务 3.2: 实现特性卡片与 FAQ 列表的可视化增删改与一键恢复默认
- [x] 任务 3.3: 接入系统设置主页面并在表单生命周期中联动保存

### 里程碑 4：多语言 i18n 设计同步
- [x] 任务 4.1: 同步完善 `zh-CN` 命名空间词条（`landing`, `admin`, `common`）
- [x] 任务 4.2: 同步完善 `en-US` 命名空间词条（`landing`, `admin`, `common`）

### 里程碑 5：文档同步、质量门禁与归档
- [x] 任务 5.1: 同步 `docs/API_AND_PROTOCOLS.md`、`docs/DATA_MODELS.md`、`docs/FRONTEND_UI_GUIDELINES.md`、`docs/VISUAL_VERIFICATION.md`
- [x] 任务 5.2: 更新 `CHANGELOG.md` 的 `[Unreleased]`
- [x] 任务 5.3: 跑通五合一门禁 `pnpm gate` 并归档规划 `pnpm plan:archive`

---

## 🧪 验收标准与测试记录

- [x] 服务端与前端单元测试通过
- [x] 前端构建 `pnpm gate:web` 无类型错误与打包告警
- [x] 全量门禁 `pnpm gate` 全绿

