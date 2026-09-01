---
title: 系统设置全参数可配置化与现代化管理面板
type: plan
status: completed
target_version: v0.4.8
created_at: "2026-09-01"
author: "Antigravity & Maintainers"
archived_at: "2026-09-01"
---
# 系统设置全参数可配置化与现代化管理面板

## 🎯 目标与背景

当前 RiriCloud 的系统设置仅开放了 3 个基础字段（站点名、注册开关、默认流量配额），大量平台运行、订阅分发、客户端行为、Agent 运维与品牌定制参数仍散落或硬编码在各模块中。

本次规划将对系统设置体系进行全面升级，构建**覆盖 5 大分类 20+ 项参数**的强类型系统配置架构，实现全参数可配置化，并重构前端管理后台为现代化多 Tab 面板，与用户端实现动态感知与优雅联动。

### 核心特性与设计原则
1. **五大核心分类体系**：
   - 🏢 **基础与品牌 (Site & Branding)**：站点名称、副标题描述、Logo URL、Favicon URL、全局公告横幅（支持 Markdown）、页脚版权、多渠道客服与群组支持链接（Telegram / Discord / 邮箱 / 自定义 URL）。
   - 👥 **注册与用户策略 (Auth & Users)**：开放注册开关、新用户默认关联套餐（`defaultPlanId`）、默认流量配额、默认有效天数（0 为永久）、邮箱域名过滤模式与后缀限制（白名单/黑名单）、密码最小长度。
   - 🔗 **订阅与分发 (Subscription & Clients)**：对外订阅基准 URL（`subscriptionBaseUrl`）、客户端更新周期（`subscriptionUpdateIntervalHours`，动态注入 `Profile-Update-Interval` 响应头）、全局默认订阅模板回退（`defaultTemplateId`）、公开线路/节点列表开关、订阅用量响应头注入开关。
   - ⚡ **Agent 运维与探针 (Agent & Node Operations)**：心跳离线判定超时阈值、配置热推送防抖延迟（`configSyncDebounceMs`）、默认 HTTP 轮询建议周期、二进制分发基准 URL 覆盖、默认网络探针预设目标列表。
   - 🎨 **安全与高级个性化 (Security & Customization)**：JWT 会话有效天数、自定义 CSS 样式注入（用于前端主题与定制）、自定义 HTML/JS 头部注入代码。
2. **注册与订阅联动决策**：
   - 优先套餐模式：若配置了 `defaultPlanId`，新用户注册时自动分配并激活该套餐订阅，生成订阅链接；若未配置默认套餐，新用户初始无订阅、无订阅链接，仪表盘显示去选购套餐引导，用户订购后正式生成订阅。
3. **零外部依赖与默认值安全回退**：
   - 基于 SQLite `SystemSetting` Key-Value 表，所有新增配置项均提供类型转换防护与内置 `DEFAULTS` 兜底，老旧数据库或缺失键平滑升级无阻。
4. **前端现代化与视觉体验**：
   - 管理员后台升级为分类清晰的 5-Tab 布局，集成 CodeMirror 代码高亮编辑器、一键填充当前 Origin 按钮与重置默认值能力；用户端仪表盘动态呈现公告横幅与客服支持。

---

## 📋 里程碑与任务清单

### 里程碑 1：后端 SettingsService 强类型扩展与 DTO 校验
- [x] 任务 1.1: 在 `apps/server/src/system/settings.service.ts` 中扩展 `SETTING_KEYS` 常量、`SystemSettings` 强类型接口与完备的 `DEFAULTS` 默认值集合。
- [x] 任务 1.2: 增强 `getSettings()` 实现批量读取、健壮的类型转换与安全回退逻辑（数字、布尔、JSON 数组/对象）。
- [x] 任务 1.3: 增强 `updateSettings()` 支持全量/部分增量 upsert 事务与格式化存储。
- [x] 任务 1.4: 新增 `getPublicSettings()` 方法，严格过滤内部与敏感运维参数，仅向非鉴权/前端公开安全的品牌、公告、客服与订阅基准信息。
- [x] 任务 1.5: 新增 `resetToDefaults()` 方法，支持恢复指定键或全部键为默认值。
- [x] 任务 1.6: 在 `apps/server/src/system/dto/update-settings.dto.ts` 中通过 `class-validator` 完善 20+ 个字段的类型、范围、URL 格式与 Swagger 注解。
- [x] 任务 1.7: 在 `apps/server/src/system/settings.controller.ts` 与 `system.controller.ts` 中暴露更新、重置与扩展后的 `GET /api/v1/system/public-info` 端点。

### 里程碑 2：业务服务与系统设置动态联动
- [x] 任务 2.1: **用户与注册模块联动 (`apps/server/src/auth/auth.service.ts`)**：
  - 接入 `passwordMinLength` 密码长度校验。
  - 接入 `emailDomainMode`（whitelist/blacklist）与 `emailDomainList` 邮箱域名过滤校验。
  - 接入 `defaultPlanId` 自动套餐分配逻辑：配置时自动调用 `SubscriptionService.subscribe()` 激活订阅；未配置时新用户初始不创建订阅与链接。
- [x] 任务 2.2: **订阅生成模块联动 (`apps/server/src/subscription/subscription.service.ts`)**：
  - 订阅响应头中的 `Profile-Update-Interval` 动态读取 `subscriptionUpdateIntervalHours`。
  - 套餐无模板时的默认模板解析优先读取系统设置 `defaultTemplateId`。
- [x] 任务 2.3: **Agent 网关与分发模块联动 (`apps/server/src/agent-gateway/` & `binaries/`)**：
  - Agent 配置同步防抖延迟接入 `configSyncDebounceMs`。
  - 二进制分发基础 URL 优先读取 `binaryDownloadBaseUrl`。

### 里程碑 3：前端 Admin 设置面板现代化重构
- [x] 任务 3.1: 重构 `apps/web/src/pages/admin/settings/index.tsx` 为 5 大选项卡布局（基础与品牌、注册与用户、订阅与分发、Agent 运维、安全与高级）。
- [x] 任务 3.2: **基础与品牌 Tab**：站点名、描述、Logo/Favicon、公告横幅多行输入、页脚版权、Telegram/Discord/Email 客服链接表单。
- [x] 任务 3.3: **注册与用户 Tab**：注册开关、默认套餐下拉选择（查询 Plan 列表）、默认配额、默认天数、邮箱过滤模式与域名列表、密码最小长度。
- [x] 任务 3.4: **订阅与分发 Tab**：订阅基准 URL（带「设为当前面板」快捷填充按钮）、更新周期小时、默认分流模板下拉选择、公开线路开关、用量响应头开关。
- [x] 任务 3.5: **Agent 运维 Tab**：心跳超时秒数、防抖延迟毫秒、轮询周期秒数、二进制分发 URL 覆盖、探针默认预设目标配置。
- [x] 任务 3.6: **安全与高级 Tab**：JWT 有效天数、集成 `@uiw/react-codemirror` 的自定义 CSS 编辑器与自定义 HTML/JS 脚本编辑器。
- [x] 任务 3.7: 顶部操作栏提供「保存设置」、「重置为默认值」确认对话框与即时 Toast 提示。

### 里程碑 4：前端全局感知、用户端仪表盘与动态样式注入
- [x] 任务 4.1: 在 `apps/web/src/App.tsx` 或根组件中通过 `useEffect` 动态挂载 `customCss` `<style>` 标签与更新网页标题、Favicon。
- [x] 任务 4.2: 用户仪表盘顶部根据 `siteAnnouncement` 渲染醒目公告横幅卡片，支持 Markdown 渲染与本地收起记忆。
- [x] 任务 4.3: 用户仪表盘订阅区域使用 `public-info` 的 `subscriptionBaseUrl` 拼装链接；当用户无有效订阅时，呈现空状态卡片引导前往套餐市场。
- [x] 任务 4.4: 侧边栏与页脚动态渲染配置的站点 Logo、站点名称、版权信息与客服/群组支持链接。

### 里程碑 5：测试套件、文档治理与质量门禁
- [x] 任务 5.1: 编写 `apps/server/src/system/settings.service.spec.ts` 覆盖全量配置读写、默认值回退、部分更新与公开字段过滤。
- [x] 任务 5.2: 编写 `apps/server/src/auth/auth.service.spec.ts` 覆盖邮箱黑白名单过滤、密码长度限制与默认套餐自动激活分支。
- [x] 任务 5.3: 更新 `docs/DATA_MODELS.md` §SystemSetting 键名与结构规范。
- [x] 任务 5.4: 更新 `docs/API_AND_PROTOCOLS.md` 记录 `/admin/settings` 与 `/system/public-info` 的请求/响应契约变更。
- [x] 任务 5.5: 更新 `docs/FRONTEND_UI_GUIDELINES.md` 记录设置面板规范与公告横幅组件规范。
- [x] 任务 5.6: 遵循分支规范切出特性分支，执行 `pnpm bump` 递增版本并更新 `CHANGELOG.md`。
- [x] 任务 5.7: 执行 `pnpm gate` 确保五合一质量门禁全绿通过。

---

## 🧪 验收标准与测试记录

- [x] 后端单元测试（SettingsService, AuthService, SubscriptionService）100% 通过且无 regression。
- [x] 前端 TypeScript 类型检查与 Vite build 100% 成功。
- [x] 5 大分类 20+ 个配置项在管理后台修改并保存后，刷新页面数据准确回填。
- [x] 注册新用户时，邮箱黑白名单过滤生效；配置默认套餐时自动生成对应订阅与订阅链接，未配置默认套餐时新用户初始无订阅。
- [x] 用户仪表盘正确根据 `subscriptionBaseUrl` 生成订阅链接，正确渲染公告横幅与客服支持入口。
- [x] 自定义 CSS 与 JS 注入在前端正常加载生效。
- [x] 门禁 `pnpm gate` 全绿（`gate:version` + `gate:docs` + `gate:server` + `gate:web` + `gate:agent`）。
