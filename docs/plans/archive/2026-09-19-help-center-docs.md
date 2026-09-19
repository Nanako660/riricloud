---
title: 用户侧帮助中心与使用文档系统实现
type: plan
status: completed
target_version: v0.8.19
created_at: "2026-09-19"
author: "Antigravity & Maintainers"
archived_at: "2026-09-19"
---
# 用户侧帮助中心与使用文档系统实现

## 🎯 目标与背景

针对代理/VPN系统小白用户上手门槛高、客户端繁多且配置复杂的问题，在主控控制台与管理后台引入**面板内置式帮助中心（Help Center & Documentation）**：
1. **开箱即用预设生态**：系统级预置 Windows (Clash Verge Rev)、macOS (Clash Verge Rev)、iOS (Shadowrocket)、Android (Clash Meta / v2rayNG) 与新手常见排错 FAQ；
2. **0 基础交互体验**：专为小白设计的双栏/大纲布局，客户端教程顶部置顶「一键导入到客户端」与当前用户专属订阅变量插值（`{{subscription_url}}` 等），支持 Markdown 重点高亮、Callout 警告块与图片灯箱放大；
3. **管理员动态可配置**：后台独立管理路由 `/admin/docs`，支持多语言/平台分类、排序、启停，提供 CodeMirror 分屏 Markdown 实时渲染预览与快捷插入工具，以及「一键恢复官方预设教程」保障机制；
4. **高质量工程与文档同步**：遵循 RiriCloud 架构契约，新增 Prisma `HelpArticle` 实体、RESTful API，更新设计文档与中英双语国际化，通过五合一全量质量门禁。

---

## 📋 里程碑与任务清单

### 里程碑 1：数据模型、服务端模块与预设教程库
- [x] 任务 1.1: 在 Prisma 中新增 `HelpArticle` 模型并执行迁移
- [x] 任务 1.2: 编写出厂预置教程库 `help-default-articles.ts`（涵盖 Windows、macOS、iOS、Android、FAQ）
- [x] 任务 1.3: 实现 `HelpModule`、`HelpService` 与 `HelpController`（用户端与管理员端 API、动态变量插值与重置预设）
- [x] 任务 1.4: 编写服务端单元测试 `help.service.spec.ts` 并确保单测通过

### 里程碑 2：前端渲染管线、公共组件与用户端帮助中心
- [x] 任务 2.1: 引入 `react-markdown` 与 `remark-gfm` 依赖，封装 `MarkdownRenderer`（支持 Callout、代码高亮复制与图片灯箱）
- [x] 任务 2.2: 封装 `ImageLightbox` 图片灯箱放大组件
- [x] 任务 2.3: 开发用户端帮助中心主页 `/help`（平台 Tab、文章侧边栏、专属一键导入操作卡、正文与 TOC 导航）
- [x] 任务 2.4: 在控制台侧边导航及「我的订阅」页新手卡片加入帮助中心入口

### 里程碑 3：管理员文档管理中心与分屏编辑器
- [x] 任务 3.1: 开发管理端文档列表页 `/admin/docs`（支持搜索、平台筛选、状态启停、排序、删除与一键恢复预设）
- [x] 任务 3.2: 开发分屏 Markdown 编辑器弹窗/页面（CodeMirror 源码 + 动态变量插入工具栏 + 实时渲染预览）
- [x] 任务 3.3: 注册管理后台侧边栏与路由守卫

### 里程碑 4：双语国际化、设计文档同步与质量门禁
- [x] 任务 4.1: 补充 `zh-CN` 与 `en-US` 前端国际化词条
- [x] 任务 4.2: 同步更新 `docs/DATA_MODELS.md` 与 `docs/API_AND_PROTOCOLS.md`
- [x] 任务 4.3: 更新 `CHANGELOG.md` 的 `[Unreleased]` 缓冲区
- [x] 任务 4.4: 运行 `pnpm gate`（包含版本、文档、服务端、前端、Agent 五项全绿）
- [x] 任务 4.5: 归档任务规划至 `docs/plans/archive/`

---

## 🧪 验收标准与测试记录

- [x] `HelpArticle` 迁移成功，首次启动或种子导入默认预置教程完整
- [x] 用户端访问 `/help` 可按平台切换教程，正文中的订阅链接与一键导入按钮自动匹配当前登录用户
- [x] Markdown 格式（表格、引用、Callout、代码、图片灯箱）渲染正常
- [x] 管理员可在 `/admin/docs` 增删改查文章，分屏实时预览与恢复预设生效
- [x] 五合一质量门禁（`pnpm gate`）全绿通过
