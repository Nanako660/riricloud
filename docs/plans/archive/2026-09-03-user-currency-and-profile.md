---
title: 用户系统完善：货币系统、个人中心、卡密充值与订阅交易闭环
type: plan
status: completed
target_version: v0.4.20
created_at: "2026-09-03"
author: "Antigravity & Maintainers"
archived_at: "2026-09-03"
---
# 用户系统完善：货币系统、个人中心、卡密充值与订阅交易闭环

## 🎯 目标与背景

当前 RiriCloud 缺少资产与货币系统，套餐无论定价多少点击即免费开通，且缺少普通用户个人中心（无法修改密码、重置连接凭据），管理后台亦无卡密充值和调账体系。

本项目将完成以下全链路升级：
1. **数据模型与精度**：以分（Int）为最小货币单位存储余额与价格；平滑迁移存量套餐标价（*100）；新增 `BalanceTransaction` 流水表与 `RedeemCode` 卡密表。
2. **货币结算与交易闭环**：实现统一的账户余额钱包，订阅购买、同套餐顺延续费与换配套餐均走严格余额扣减事务；余额不足拦截购买并支持快捷卡密充值。
3. **独立个人中心 (`/profile`)**：仅收敛用户账号自身维度——资产余额展示、卡密充值兑换、收支明细账本、修改登录密码、查看并重置代理凭据 (VLESS UUID)；订阅与节点保留在现有结构。
4. **管理后台全套运维**：新增 `/admin/redeem-codes` 卡密管理（批量生成高强度卡密、一键换行复制导出、状态作废）；在「用户管理」中展示余额并支持人工调账；在「系统设置」中新增新用户注册初始余额配置。

---

## 📋 里程碑与任务清单

### 里程碑 1：数据持久化与数据库迁移 (Prisma & SQLite)
- [x] 任务 1.1: 在 `apps/server/prisma/schema.prisma` 的 `User` 模型中增加 `balance Int @default(0)` 与相应关联。
- [x] 任务 1.2: 在 `schema.prisma` 中新增 `BalanceTransaction`（流水表）与 `RedeemCode`（卡密表）模型及必要索引。
- [x] 任务 1.3: 创建数据库迁移脚本 `20260903060000_user_currency_and_redeem_codes/migration.sql`，建表并执行历史套餐价格平滑过渡（`UPDATE "Plan" SET "price" = "price" * 100 WHERE "price" > 0;`）。
- [x] 任务 1.4: 执行 `prisma generate` 并验证数据库迁移与种子数据兼容性。

### 里程碑 2：主控后端服务与 API 实现 (apps/server)
- [x] 任务 2.1: **系统设置与注册赠金**：在 `settings.service.ts` 支持 `defaultBalance` 配置；在 `auth.service.ts` 注册逻辑中支持初始余额赠送并写入 `SYSTEM_GIFT` 流水；`getMe` 接口返回 `balance` 与 `uuid`。
- [x] 任务 2.2: **个人安全与凭证接口**：在 `users.service.ts` 与 `users.controller.ts` 实现 `changePassword`（旧密码校验与哈希更新）与 `resetUuid`（重置 VLESS UUID 并全网下发配置）。
- [x] 任务 2.3: **钱包与卡密兑换模块 (`wallet`)**：新建 `wallet` 模块，提供 `GET /user/wallet`（余额与统计）、`GET /user/wallet/transactions`（流水明细分页）与 `POST /user/wallet/redeem`（原子卡密核销充值与流水记录）。
- [x] 任务 2.4: **订阅计费交易闭环 (`subscription`)**：
  - 重构 `subscribe`：校验 `user.balance >= plan.price`，事务中扣减余额并写入 `PLAN_BUY` 流水。
  - 新增 `renew`：提供 `POST /user/subscription/renew`，校验余额后顺延到期时间 `durationDays`，重置当期已用流量，扣减余额并记录 `PLAN_RENEW` 流水。
  - 重构 `upgrade`：校验余额后全价扣减，刷新周期与配额，记录 `PLAN_UPGRADE` 流水。
- [x] 任务 2.5: **管理后台卡密管理 (`redeem-codes`)**：新建 `redeem-codes` 模块，提供 `GET /admin/redeem-codes`（分页与状态筛选）、`POST /admin/redeem-codes/batch`（批量生成随机卡密、支持前缀/面额/有效期/备注）与 `POST /admin/redeem-codes/:id/revoke`（作废未使用卡密）。
- [x] 任务 2.6: **管理后台用户调账**：在 `users-admin.controller.ts` 与 `users.service.ts` 增加 `POST /admin/users/:id/adjust-balance`，管理员人工增减余额并记录 `ADMIN_ADJUST` 流水；用户列表输出 `balance`。
- [x] 任务 2.7: **套餐价格单位规范**：调整 `plans.service.ts` 与 DTO，支持前端以元为单位传参并转换为分进行持久化。

### 里程碑 3：前端页面与交互组件 (apps/web)
- [x] 任务 3.1: **全局导航与路由注册**：在 `router/index.tsx` 注册 `/profile` 与 `/admin/redeem-codes`；在 `app-sidebar.tsx` 与 `user-menu.tsx` 增加个人中心与卡密管理导航入口。
- [x] 任务 3.2: **个人中心页面 (`pages/user/profile/index.tsx`)**：
  - 账户资产与充值卡片：大字号余额展示、卡密快捷充值输入框与兑换按钮、充值与消费明细分页表格。
  - 安全与凭据卡片：基本信息展示、修改登录密码表单、VLESS UUID 展示与复制、重置连接凭据危险弹窗。
- [x] 任务 3.3: **套餐市场订购体验升级 (`pages/user/market/index.tsx`)**：
  - 订购/升配弹窗接入实时余额与套餐价格核对；
  - 余额充足支持一键确认扣款；余额不足高亮提示缺额，内置快捷卡密充值输入行与个人中心跳转链接。
- [x] 任务 3.4: **我的订阅续费体验 (`pages/user/subscription/index.tsx`)**：
  - 订阅卡片顶部操作区增加「续费此套餐」按钮；
  - 续费弹窗展示续费金额、当前余额、延期预估，支持快捷卡密充值。
- [x] 任务 3.5: **管理端卡密管理后台 (`pages/admin/redeem-codes/index.tsx`)**：
  - 卡密列表展示、搜索与状态过滤；
  - 批量生成弹窗与一键换行复制全部生成卡密弹窗；
  - 未使用卡密作废操作。
- [x] 任务 3.6: **管理端用户列表调账与套餐管理改造**：
  - 用户管理列表展示「账户余额」列，操作菜单增加「调整余额」弹窗；
  - 套餐管理编辑弹窗支持以元（保留两位小数）输入与展示价格；
  - 系统设置页面增加「新用户注册初始余额（元）」输入项。

### 里程碑 4：测试套件、文档治理与质量门禁
- [x] 任务 4.1: 编写/更新服务端自动化测试（`wallet.service.spec.ts`、`subscription.service.spec.ts`、`users.service.spec.ts`）。
- [x] 任务 4.2: 同步更新 `docs/DATA_MODELS.md`（新增 User 余额、BalanceTransaction 与 RedeemCode 模型说明）。
- [x] 任务 4.3: 同步更新 `docs/API_AND_PROTOCOLS.md`（新增用户中心、钱包流水、卡密管理与管理员调账接口协议）。
- [x] 任务 4.4: 同步更新 `docs/FRONTEND_UI_GUIDELINES.md` 或 `docs/VISUAL_VERIFICATION.md`。
- [x] 任务 4.5: 在 `CHANGELOG.md` 的 `## [Unreleased]` 中记录特性与变更条目。
- [x] 任务 4.6: 运行五合一门禁 `pnpm gate` 确保全绿（`gate:version`、`gate:docs`、`gate:server`、`gate:web`、`gate:agent`）。
- [x] 任务 4.7: 全部任务完成后执行 `pnpm plan:archive docs/plans/user-currency-and-profile.md` 归档。

---

## 🧪 验收标准与测试记录

- [x] 单元测试通过率 100%（涵盖卡密并发兑换、余额扣减事务、同套餐延期与换配全价扣费）
- [x] `pnpm gate:server` 通过
- [x] `pnpm gate:web` 通过
- [x] `pnpm gate:docs` 通过
- [x] `pnpm gate` 全量门禁通过
