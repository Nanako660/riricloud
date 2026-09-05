---
title: 强制邮箱验证、未验证禁用订阅与找回密码全链路
type: plan
status: completed
target_version: v0.6.12
created_at: "2026-09-06"
author: "Antigravity & Maintainers"
archived_at: "2026-09-06"
---
# 强制邮箱验证、未验证禁用订阅与找回密码全链路

## 🎯 目标与背景

1. **存量用户邮箱核验治理**：引入 `emailVerifiedAt` 时间戳标识，区分已验证与未验证用户。
2. **强制邮箱验证与订阅禁用门禁**：
   - 增加系统设置 `enforceEmailVerification` 开关（默认 false，支持平滑过渡）；
   - 开启后，未验证普通用户请求订阅接口（`GET /api/v1/sub/:token`）返回 HTTP 403 Forbidden；
   - 节点 Sing-box 数据平面配置生成时动态剔除未验证普通用户凭证；
   - 管理员（`role === 'ADMIN'`）自动豁免未验证拦截。
3. **存量用户自主核验与换绑**：
   - 个人中心与我的订阅页面提供一键向当前邮箱发送 6 位验证码完成核验；
   - 换绑邮箱成功后自动更新为已验证；
   - 订阅页面提供警告横幅与订阅链接锁定交互。
4. **找回密码功能（Forgot Password）**：
   - 独立路由 `/forgot-password` 与登录页入口；
   - 向注册邮箱发送 6 位重置验证码（支持未注册邮箱报错与防刷 Captcha 校验）；
   - 重置密码成功后自动将用户标记为已验证，顺带解除其订阅禁用；
   - 重置完成后提示成功并返回 `/login` 登录页。

---

## 📋 里程碑与任务清单

### 里程碑 1：数据模型与数据库迁移
- [x] 任务 1.1: 在 `apps/server/prisma/schema.prisma` 的 `User` 模型中增加 `emailVerifiedAt DateTime?`
- [x] 任务 1.2: 执行 Prisma 迁移并更新 client
- [x] 任务 1.3: 更新 `docs/DATA_MODELS.md`

### 里程碑 2：服务端业务逻辑开发
- [x] 任务 2.1: `settings.service.ts` 与 DTO 增加 `enforceEmailVerification` 系统设置
- [x] 任务 2.2: `verification.service.ts` 与邮件模板增加 `VERIFY_CURRENT_EMAIL` 与 `RESET_PASSWORD`
- [x] 任务 2.3: `auth.controller.ts` 与 `auth.service.ts` 实现找回密码 `POST /auth/reset-password`，并在注册成功且开启验证时标记 `emailVerifiedAt`
- [x] 任务 2.4: `users.controller.ts` 与 `users.service.ts` 实现当前邮箱核验 `POST /user/verify-email`，并在换绑邮箱成功时标记 `emailVerifiedAt`
- [x] 任务 2.5: `subscription.service.ts` 增加未验证拦截（403 抛错，管理员豁免）
- [x] 任务 2.6: `agent-gateway.service.ts` 在下发 Sing-box 配置时过滤未验证凭证（管理员豁免）
- [x] 任务 2.7: `users-admin.controller.ts` 支持管理员查看与编辑用户核验状态
- [x] 任务 2.8: 更新 `docs/API_AND_PROTOCOLS.md`

### 里程碑 3：前端交互与界面开发
- [x] 任务 3.1: 独立路由页面 `apps/web/src/pages/forgot-password/` 开发与路由挂载
- [x] 任务 3.2: 登录页 `apps/web/src/pages/login/` 增加“忘记密码？”入口链接
- [x] 任务 3.3: 个人中心 `apps/web/src/pages/user/profile/` 增加邮箱验证状态徽标与核验当前邮箱弹窗
- [x] 任务 3.4: 我的订阅页 `apps/web/src/pages/user/subscription/` 增加未验证警告横幅与订阅锁定交互
- [x] 任务 3.5: 系统设置页 `apps/web/src/pages/admin/settings/` 增加强制邮箱验证开关
- [x] 任务 3.6: 用户管理页 `apps/web/src/pages/admin/users/` 增加邮箱验证状态列与编辑支持

### 里程碑 4：测试与工程门禁
- [x] 任务 4.1: 编写/更新服务端单元测试（auth, users, verification, subscription, agent-gateway）
- [x] 任务 4.2: 维护 `CHANGELOG.md` 顶部的 `[Unreleased]` 缓冲区
- [x] 任务 4.3: 运行 `pnpm gate`（五合一门禁全部通过）
- [x] 任务 4.4: 归档规划文档 `pnpm plan:archive docs/plans/email-verification-and-password-reset.md`

---

## 🧪 验收标准与测试记录

- [x] 单元测试全绿 (`pnpm gate:server`)
- [x] 前端构建与代码风格全绿 (`pnpm gate:web`)
- [x] 文档治理与版本约束全绿 (`pnpm gate:docs`, `pnpm gate:version`)
- [x] 未核验普通用户在开启强制核验后无法获取订阅或连接节点，核验/换绑/重置后即时恢复

