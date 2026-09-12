---
title: "binary-resource-center-enhancement"
type: plan
status: active
target_version: "v0.8.8"
created_at: "2026-09-13"
author: "Antigravity & Maintainers"
---

# binary-resource-center-enhancement

## 🎯 目标与背景

侧边栏「资源管理」页（`/admin/binaries`，Agent/Sing-box 二进制资源中心）是全系统管理能力最弱的资源模块：后端列表接口是唯一没有分页/搜索/筛选参数的接口，无删除、无编辑、无批量操作，审计日志只写不读，平台枚举在服务端两处 + 前端一处硬编码且互不一致；前端表单使用裸 `useState` + 手工正则校验（无字段级错误提示），SHA-256 需要管理员手动粘贴，搜索/筛选全靠前端内存过滤；后端已有的节点任务重试/回滚接口前端从未接入。

本规划一次性补齐资源中心生命周期、列表与批量能力、上传/导入体验与可观测性，并打通节点升级链路（任务列表、重试、回滚）。

预期交付成果：
- 后端：统一平台枚举 SSOT、服务端分页/搜索/筛选、PATCH 编辑、DELETE（含磁盘清理与引用保护）、RETIRED 恢复出口、默认资源自动转移、批量操作、审计日志查询 API、分发记录分页、节点任务列表 API。
- 前端：资源管理页重构（服务端查询、批量工具栏、RHF+zod 表单、自动计算 SHA-256、详情增强、审计视图）；节点详情接入升级分发记录与重试/回滚。

---

## 📋 里程碑与任务清单

### 里程碑 1：后端资源中心 API 补全（apps/server）
- [x] 任务 1.1: 新建 `binary-targets.ts` 平台枚举 SSOT，DTO/旧版 TARGETS/LEGACY_TARGETS 全部派生
- [x] 任务 1.2: `GET /admin/binary-resources` 服务端分页/搜索/筛选（QueryBinaryResourceDto），响应携带 supportedTargets
- [x] 任务 1.3: `PATCH /admin/binary-resources/:id` 编辑 notes 与兼容性约束（字段白名单校验）
- [x] 任务 1.4: `DELETE /admin/binary-resources/:id`（BUILTIN/ACTIVE/有分发历史拒绝；RUNTIME 文件清理；审计 RESOURCE_DELETED）
- [x] 任务 1.5: `POST .../:id/restore` 归档恢复出口 + disable/retire 默认资源自动转移
- [x] 任务 1.6: `POST /admin/binary-resources/batch` 批量 activate/disable/retire/delete（逐项结果）
- [x] 任务 1.7: `GET /admin/binary-resources/audit-logs` 审计查询（补全操作者昵称/邮箱）
- [x] 任务 1.8: `GET .../:id/deployments` 分页 + 状态筛选；`GET /admin/nodes/:id/tasks` 节点任务列表
- [x] 任务 1.9: 服务测试补齐（分页/删除/编辑/恢复/默认转移/批量/审计）

### 里程碑 2：前端资源管理页重构与升级链路（apps/web）
- [x] 任务 2.1: use-binaries.ts 服务端查询（防抖搜索）+ patch/delete/restore/batch mutations + 审计查询
- [x] 任务 2.2: ResourceForm 重写（react-hook-form + zod + 上传文件自动计算 SHA-256）
- [x] 任务 2.3: 列表页改造（服务端分页筛选、行多选批量工具栏、编辑/恢复/删除操作、平台选项来自 supportedTargets）
- [x] 任务 2.4: 资源详情弹窗增强（notes/兼容性展示、分发任务分页列表与就地重试）
- [x] 任务 2.5: use-nodes.ts 新增 useNodeTasks/retry/rollback；节点详情接入「升级分发记录」卡片
- [x] 任务 2.6: 升级中心弹窗展示平台资产数（失败重试由分发记录卡片与详情弹窗承担）

### 里程碑 3：文档与质量门禁
- [x] 任务 3.1: 同步更新 API_AND_PROTOCOLS.md §2.4、VISUAL_VERIFICATION.md 台账（UI-10/UI-22/UI-31）、CHANGELOG [Unreleased]
- [ ] 任务 3.2: 门禁全绿自查与归档准备

---

## 🧪 验收标准与测试记录

- [x] server: binaries 模块 jest 全绿（28 例，含新增 10 例）
- [x] web: tsc + eslint + vite build 全绿
- [x] pnpm gate 全绿（本机 gate:agent 通过注入主仓库便携 Go 工具链执行；改动未触碰 apps/agent）
- [ ] PR 创建并等待 CI（按维护者要求：只提交不合并，合并由维护者审阅后执行）

## 🚫 非目标

- 上传流式化（保留 100MB 内存 buffer 现状）
- 下载鉴权按节点授权粒度收敛（安全债另行处理）
- 旧版 `/admin/binaries/info|import` 双轨 API 下线（升级中心仍在使用）
- 中继凭据安全整改（见 `security-audit-public-relay-credentials.md`）
