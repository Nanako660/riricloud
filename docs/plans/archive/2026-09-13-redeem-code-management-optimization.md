---
title: 卡密管理功能优化（统计/搜索分页/批量操作/安全审计/数据治理）
type: plan
status: completed
target_version: 0.9.0
created_at: "2026-09-13"
author: "Antigravity & Maintainers"
archived_at: "2026-09-13"
---
# 卡密管理功能优化计划

## 🎯 目标与背景

卡密（RedeemCode）功能自 v0.4.20 落地后管理侧能力单薄：列表无分页 UI（pageSize 硬编码 100，超量数据不可见）、后端 `search` 能力前端未暴露、不展示兑换人信息、无汇总统计、无导出与批量作废、管理员操作无审计、用户兑换无限流防护、批量生成串行长事务。本计划在不新增外部依赖、不改动 Prisma schema 的前提下，分四个方向补齐：

1. **管理页体验**：分页 + 防抖搜索 + 兑换人/兑换时间列 + 状态统计卡片 + 误导文案修正。
2. **批量操作**：CSV/TXT 导出、行选择批量作废、过期卡密清理。
3. **安全与审计**：管理操作写 SystemLog 审计、兑换端点限流、列表卡密默认掩码显示。
4. **数据治理与性能**：批量生成改为预生成 + `createMany` 短事务。

关键决策：
- **审计复用 `SystemLogsService.enqueue`**（module=`REDEEM_CODE`），不新建审计表、零 Prisma migration；审计 metadata 只记录数量与参数，**卡密明文严禁入日志**。
- **限流复用 `common/RateLimitService`**（进程内滑动窗口），`WalletModule` 引入 `SystemModule` 获取单例；按用户维度限流（卡密爆破需先持有账号）。
- **导出复用 system-logs 的 CSV 拼装与响应头模式**（`Content-Disposition` attachment），前端复用 logs 页 blob 下载模式；导出上限 10000 条。
- **EXPIRED 保持读取时派生状态**，不做落库迁移；统计口径与列表筛选一致（UNUSED=未使用且未过期）。

---

## 📋 里程碑与任务清单

### 里程碑 1：后端能力（apps/server）
- [x] 任务 1.1: `list` 关联返回 `redeemedBy`（id/email/nickname），抽出 `buildWhere` 复用筛选逻辑
- [x] 任务 1.2: 新增 `GET /admin/redeem-codes/stats` 汇总统计（四态计数 + 金额分值）
- [x] 任务 1.3: 新增 `GET /admin/redeem-codes/export?format=csv|txt`（复用状态/搜索筛选，CSV 转义与 attachment 响应头，上限 10000 条）
- [x] 任务 1.4: 新增 `POST /admin/redeem-codes/batch-revoke`（ids ∈ [1,500]，仅 UNUSED 可作废，返回 revoked/skipped 计数）
- [x] 任务 1.5: 新增 `POST /admin/redeem-codes/cleanup`（删除过期超过 retentionDays 的 UNUSED 卡密，默认 30 天）
- [x] 任务 1.6: 管理操作（批量生成/作废/批量作废/清理）接入 SystemLog 审计，操作者 userId 入档，卡密明文不落日志
- [x] 任务 1.7: `POST /user/wallet/redeem` 接入 RateLimitService 限流（按用户，超限 429）
- [x] 任务 1.8: `batchCreate` 重构为候选码预生成 + 碰撞预检重试 + 单事务 `createMany` + 回读
- [x] 任务 1.9: 补充/更新 service 单测（stats、export、batch-revoke、cleanup、限流、批量生成重构、审计）

### 里程碑 2：前端管理页重构（apps/web）
- [x] 任务 2.1: hooks 扩展：分页/搜索/状态参数化查询、stats 查询、导出 blob 下载、批量作废、清理 mutations
- [x] 任务 2.2: 页面接入防抖搜索框 + 服务端分页控件（Pagination 组件，users/logs 页模式）
- [x] 任务 2.3: 统计卡片区（四态数量 + 金额，`formatCurrency` 展示）与表格新增兑换人、兑换时间列
- [x] 任务 2.4: 行选择 Checkbox + 批量作废 AlertDialog；工具栏导出 DropdownMenu（CSV/TXT，携带当前筛选）与清理过期按钮（AlertDialog 确认）
- [x] 任务 2.5: 卡密列默认掩码（保留前缀与末 4 位）+ 列头明文切换；生成成功弹窗文案与实际行为对齐
- [x] 任务 2.6: 修正个人中心「卡密区分大小写」误导文案；组件行数与拆分满足 W5（≤300 行）

### 里程碑 3：文档同步与质量门禁
- [x] 任务 3.1: `docs/API_AND_PROTOCOLS.md` 卡密管理小节补 4 个新端点、list 响应 redeemedBy、redeem 限流语义
- [x] 任务 3.2: `docs/FRONTEND_UI_GUIDELINES.md` §12 与 `docs/VISUAL_VERIFICATION.md` UI-30 检查点同步新交互
- [x] 任务 3.3: `CHANGELOG.md` `[Unreleased]` 追加 Added/Changed/Fixed 条目（版本号保持不变）
- [x] 任务 3.4: `pnpm gate` 全绿（version/docs/server/web/agent），完成后 `pnpm plan:archive` 归档本规划

---

## 🧪 验收标准与测试记录

- [x] 单元测试 / 门禁全绿
- [x] 联调验收通过
