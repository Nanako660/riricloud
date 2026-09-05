---
title: "用户系统完善：随机数字 UID、自定义昵称、换绑邮箱、SMTP 邮箱验证与双模式人机验证"
type: plan
status: completed
target_version: v0.6.11
created_at: "2026-09-05"
author: "Antigravity & Maintainers"
archived_at: "2026-09-05"
---
# 用户系统完善：随机数字 UID、自定义昵称、换绑邮箱、SMTP 邮箱验证与双模式人机验证

## 🎯 目标与背景

随着 RiriCloud 从单租户与基础原型走向更完善的多用户代理运营管理平台，当前用户体系存在以下痛点需要系统化解决：
1. **用户标识难以口头沟通**：目前系统使用 36 位 UUID 标识用户，日常客服沟通、报号及排查极不便。需要一套 6 位随机纯数字 UID（`100000` ~ `999999`），直观清晰且全站唯一。
2. **缺乏个性化称谓**：用户缺少昵称字段，界面交互均直接显示长邮箱。需支持注册选填与个人中心自由修改昵称（未填自动兜底为「用户_<UID>」）。
3. **缺少邮箱自主换绑**：用户一旦注册无法更改邮箱。需提供「新邮箱验证码 + 当前密码二次确认」的安全换绑流程。
4. **缺少注册邮箱验证与 SMTP 体系**：此前注册无需邮箱验证，易被滥用虚假邮箱。需在系统设置中支持管理员可视化配置 SMTP、测试发信，并提供「注册邮箱验证」开关（支持 6 位验证码、5 分钟有效期与 60 秒冷却防刷）。
5. **人机验证防护**：为防止恶意刷接口滥用 SMTP，提供开箱即用双模式人机验证——默认「纯本地 SVG 算术/图形验证码」（零外部依赖，100% 离线与内网畅通）与「Cloudflare Turnstile」（无感验证），支持后台随时切换或关闭。在点击获取验证码前进行人机拦截。
6. **管理端协同升级**：用户管理列表增加 UID 与昵称列并支持精确/模糊搜索；系统设置新增「邮件服务」与「人机验证」专用配置卡片与测试调试工具。

---

## 📋 里程碑与任务清单

### 里程碑 1：数据持久化与数据库迁移 (Prisma & SQLite)
- [x] 任务 1.1: 在 `apps/server/prisma/schema.prisma` 的 `User` 模型中增加 `uid Int? @unique`（6 位随机数字唯一标识）与 `nickname String?`（自定义昵称）。
- [x] 任务 1.2: 在 `schema.prisma` 中新增 `VerificationCode` 验证码持久化模型（包含 `id`, `email`, `code`, `action`, `attempts`, `expiresAt`, `createdAt` 字段及复合索引）。
- [x] 任务 1.3: 创建数据库迁移脚本 `apps/server/prisma/migrations/xxxx_user_system_enhancement/migration.sql`，执行表与字段变更，并编写数据平滑过渡逻辑（为存量已有用户批量分配不冲突的 6 位随机 UID）。
- [x] 任务 1.4: 执行 `prisma generate` 并在本地验证数据完整性与唯一索引约束。

### 里程碑 2：邮件服务 (SMTP) 与验证码模块 (apps/server)
- [x] 任务 2.1: 在 `apps/server` 引入 `nodemailer` 与 `@types/nodemailer` 依赖。
- [x] 任务 2.2: 在 `settings.service.ts` 中扩充 SMTP 相关系统设置项（`smtpEnabled`, `smtpHost`, `smtpPort`, `smtpSecure`, `smtpUser`, `smtpPass`, `smtpFrom`, `emailVerificationEnabled`），实现读取、脱敏返回与保存。
- [x] 任务 2.3: 新建 `mail` 模块（`mail.module.ts`, `mail.service.ts`），基于系统设置动态构建 Transporter，提供现代响应式 HTML 验证码邮件模板（带站点名称与 Logo、高亮验证码、5 分钟有效提示与版权声明）。
- [x] 任务 2.4: 在 `settings.controller.ts` 与 `settings.service.ts` 实现 `POST /admin/settings/smtp/test` 接口，支持管理员在后台填写测试邮箱一键测试 SMTP 联通性并返回详细执行结果。
- [x] 任务 2.5: 新建 `verification` 模块（`verification.module.ts`, `verification.service.ts`），实现 6 位数字验证码生成、入库、5 分钟过期淘汰、60 秒同邮箱防刷冷却与最多 5 次错误尝试熔断。

### 里程碑 3：双模式人机验证 (CAPTCHA) 模块 (apps/server)
- [x] 任务 3.1: 在 `apps/server` 引入 `svg-captcha` 纯 JS 图形验证码依赖（零外部原生编译依赖）。
- [x] 任务 3.2: 在 `settings.service.ts` 扩充人机验证设置项（`captchaMode`: `OFF` | `LOCAL` | `TURNSTILE`, `turnstileSiteKey`, `turnstileSecretKey`），并在公共设置 `getPublicSettings` 中向前端安全暴露 `captchaMode` 与 `turnstileSiteKey`。
- [x] 任务 3.3: 新建 `captcha` 模块（`captcha.module.ts`, `captcha.service.ts`, `captcha.controller.ts`），实现 `GET /captcha/local`（生成 SVG 验证码及带签名的验证凭据）。
- [x] 任务 3.4: 在 `CaptchaService` 实现统一的 `verifyCaptcha` 逻辑：当模式为 LOCAL 时校验图形码输入，当模式为 TURNSTILE 时向 Cloudflare 官方校验接口发起 token 校验，当模式为 OFF 时放行。

### 里程碑 4：用户端与管理端核心业务 API (apps/server)
- [x] 任务 4.1: 新建验证码接口 `POST /verification/send-code`：接收邮箱与行为（`REGISTER` | `CHANGE_EMAIL`），若为注册前置校验人机验证，校验通过后生成验证码并调用 `MailService` 发送邮件。
- [x] 任务 4.2: 重构 `AuthService.register` 注册逻辑：支持 `nickname` 选填（未填默认生成 `用户_${uid}`）；生成唯一 6 位数字 UID（碰撞自旋重试）；若启用邮箱验证则强校验验证码；若仅启用人机验证则校验提交的人机 token；`getMe` 返回 `uid` 与 `nickname`。
- [x] 任务 4.3: 在 `UsersService` 与 `UsersController` 新增 `PATCH /user/profile` 接口：允许用户修改个人昵称（2~20 字符长度约束与清洗）。
- [x] 任务 4.4: 在 `UsersService` 与 `UsersController` 新增 `POST /user/change-email` 接口：接收新邮箱、新邮箱收到的 6 位验证码以及当前密码，原子校验新邮箱唯一性、验证码与密码后完成换绑。
- [x] 任务 4.5: 改造 `UsersService.listUsers` 管理端列表接口：返回 `uid` 与 `nickname` 字段，支持通过 UID 精确查询或昵称/邮箱模糊检索。

### 里程碑 5：前端界面与交互组件升级 (apps/web)
- [x] 任务 5.1: 升级注册页面 (`pages/register/index.tsx`)：
  - 增加「昵称（选填）」输入项；
  - 接入公共系统设置（`emailVerificationEnabled`, `captchaMode`, `turnstileSiteKey`）；
  - 当启用邮箱验证时，增加「邮箱验证码」输入行与「获取验证码」按钮；点击时前置完成人机验证（本地 SVG 验证码弹窗或 Turnstile 无感校验），成功后进入 60 秒倒计时；
  - 当仅开启人机验证时，在注册按钮前渲染人机验证组件。
- [x] 任务 5.2: 升级个人中心页面 (`pages/user/profile/index.tsx`) 与 `use-profile.ts`：
  - 账号卡片以醒目标签展示 6 位数字 UID（附带一键复制）；
  - 昵称就地编辑与保存表单交互；
  - 新增「更换邮箱」操作按钮与专用弹窗：输入新邮箱 -> 获取新邮箱验证码 (60s 倒计时) -> 输入当前密码二次确认 -> 提交换绑。
- [x] 任务 5.3: 升级顶栏与用户下拉菜单 (`user-menu.tsx`)：优先展示用户昵称与 UID，增强归属感与一致性。
- [x] 任务 5.4: 升级系统设置管理页 (`pages/admin/settings/index.tsx`)：
  - 新增「邮件服务 (SMTP)」设置卡片：支持配置发信开关、SMTP 服务器、端口、SSL/TLS、账号、密码（脱敏保留）、发信人地址与「启用注册邮箱验证」开关；内置「发送测试邮件」交互抽屉/弹窗，实时显示调试反馈；
  - 新增「人机验证 (CAPTCHA)」设置卡片：支持切换「关闭 / 本地图形验证码 / Cloudflare Turnstile」，选择 Turnstile 时提供 SiteKey 与 SecretKey 输入与指引。
- [x] 任务 5.5: 升级用户管理页面 (`pages/admin/users/index.tsx`)：表格增加「UID」与「昵称」列，顶部搜索栏支持输入 UID 或昵称进行联动搜索。

### 里程碑 6：自动化测试、文档治理与质量门禁
- [x] 任务 6.1: 编写服务端单元测试套件（覆盖 `auth.service.spec.ts`, `users.service.spec.ts`, `verification.service.spec.ts`, `captcha.service.spec.ts`, `mail.service.spec.ts`）。
- [x] 任务 6.2: 同步更新 `docs/DATA_MODELS.md`（记录 User 模型扩充字段、VerificationCode 模型及 SystemSetting 新增参数说明）。
- [x] 任务 6.3: 同步更新 `docs/API_AND_PROTOCOLS.md`（记录验证码、人机验证、换绑邮箱、修改昵称与 SMTP 测试等 REST 接口契约）。
- [x] 任务 6.4: 同步更新 `docs/TECH_STACK.md`（补充 nodemailer 与 svg-captcha 选型依据与职责边界）。
- [x] 任务 6.5: 同步更新 `docs/FRONTEND_UI_GUIDELINES.md` 或 `docs/VISUAL_VERIFICATION.md`。
- [x] 任务 6.6: 在 `CHANGELOG.md` 顶部的 `## [Unreleased]` 维护本次特性的详细变更条目。
- [x] 任务 6.7: 执行五合一质量门禁 `pnpm gate` 确保全绿（`gate:version`, `gate:docs`, `gate:server`, `gate:web`, `gate:agent`）。

---

## 🧪 验收标准与测试记录

- [x] 单元测试通过率 100%（涵盖 UID 防碰撞自旋、默认昵称生成、邮箱验证码 5 分钟过期/60s 冷却/5次熔断、换绑密码确认、本地验证码与 Turnstile 校验分支）
- [x] `pnpm gate:version` 校验通过
- [x] `pnpm gate:docs` 文档与规划治理校验通过
- [x] `pnpm gate:server` TypeScript + ESLint + Jest 全量通过
- [x] `pnpm gate:web` 前端类型检查、Lint 与生产打包全量通过
- [x] `pnpm gate:agent` Go 门禁通过
- [x] `pnpm gate` 五合一综合门禁全绿通过
