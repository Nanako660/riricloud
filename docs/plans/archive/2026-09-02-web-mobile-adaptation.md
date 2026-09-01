---
title: "RiriCloud 全站移动端适配"
type: plan
status: completed
target_version: v0.4.15
created_at: "2026-09-01"
author: "Antigravity & Maintainers"
archived_at: "2026-09-01"
---
# RiriCloud 全站移动端适配

## 🎯 目标与背景

基于 shadcn/ui 官方 Sidebar、Sheet 与 Table 模式，补齐 RiriCloud 全站 `375px` 起的移动端布局与交互，保持桌面 Inset 体验，不改变后端接口和数据模型。

---

## 📋 里程碑与任务清单

### 里程碑 1：核心基础组件
- [x] 扩展 SidebarProvider 的移动端状态并接入 Sheet 抽屉
- [x] 新增 Sheet 原子组件与 ResponsiveDialog

### 里程碑 2：前端交互与联调
- [x] 完成布局、表格、筛选工具栏、Tabs、复杂弹窗和全站页面响应式调整
- [x] 完成前端类型检查、Lint 与生产构建

### 里程碑 3：文档与质量门禁
- [x] 同步更新前端规范、视觉验证台账与 CHANGELOG
- [x] 完成计划归档准备

---

## 🧪 验收标准与测试记录

- [x] `pnpm gate:web` 通过
- [x] `git diff --check` 通过
- [x] `pnpm gate:docs` 待归档后复跑
