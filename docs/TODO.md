# RiriCloud 架构重构与功能落地 TODO 清单

本文档依据架构设计对齐结论（单用户唯一订阅与生命周期、管理端高度可视化订阅定制、极简 Agent 与远程热升级通道），拆解为细粒度、可执行、可检验的原子任务清单。

---

## 📋 里程碑总览

- [x] **里程碑 1：数据模型与数据库层重构 (Database & Data Models)**
- [x] **里程碑 2：主控后端核心业务服务开发 (`apps/server`)**
- [x] **里程碑 3：主从通信扩展与极简 Agent 远程自升级 (`apps/server/agent-gateway` & `apps/agent`)**
- [x] **里程碑 4：管理端 Web 前端开发 (`apps/web` Admin)**
- [x] **里程碑 5：用户端 Web 前端开发 (`apps/web` User)**
- [x] **里程碑 6：文档同步、质量门禁与全链路端到端验收**

---

## 🛠️ 任务细化清单

### 里程碑 1：数据模型与数据库层重构 (Database & Data Models)

- [x] **1.1 Prisma Schema 实体设计与落地** (`apps/server/prisma/schema.prisma`)
  - [x] 新增 `Plan`（套餐/计划模型）：包含 `name`, `description`, `price`, `durationDays`, `trafficLimitBytes`, `nodeMatchMode` (ALL/TAGS/EXPLICIT), `nodeTagsJson`, `nodeIdsJson`, `templateId`, `isPublic`, `sortOrder`。
  - [x] 新增 `Subscription`（用户订阅实例模型）：包含 `userId` (1:1 唯一约束), `planId`, `status` (ACTIVE/CANCELED/EXPIRED/REVOKED), `trafficLimitBytes`, `trafficUsedBytes`, `startedAt`, `expireAt`, `subscriptionToken`。
  - [x] 新增 `SubscriptionTemplate`（订阅可视化模板模型）：包含 `name`, `description`, `isDefault`, `proxyGroupsJson`, `ruleSetsJson`, `dnsConfigJson`, `customInjectYaml`, `customInjectJson`。
  - [x] 扩展 `Node`（节点模型）：新增 `tagsJson` (字符串数组存储标签，如 `["vip", "hk"]`)，新增 `level` (Int，节点等级)。
  - [x] 调整 `User` 模型关联：添加与 `Subscription` 的 1:1 关系；平滑兼容迁移。
- [x] **1.2 数据库迁移与种子数据升级** (`apps/server/prisma/seed.js`)
  - [x] 运行 `prisma migrate dev` 生成数据库迁移脚本。
  - [x] 升级 `seed.js`：播种默认订阅模板（含常用分流规则与策略组）、默认体验套餐（Plan），并为内置管理员与演示账号绑定默认订阅。
  - [x] 验证 `pnpm setup` 执行无报错。

---

### 里程碑 2：主控后端核心业务服务开发 (`apps/server`)

- [x] **2.1 套餐管理模块 (`PlanModule`)**
  - [x] 编写 DTO 与校验规则（`CreatePlanDto`, `UpdatePlanDto`, `QueryPlanDto`）。
  - [x] 实现 `PlanService`：
    - [x] 套餐 CRUD（新建、列表分页与过滤、详情、更新、删除/下架）。
    - [x] 节点动态匹配算法：根据 `nodeMatchMode`（全部/按标签/显式 ID）计算该套餐当前可用的有效在线节点列表。
  - [x] 实现 `AdminPlanController`（管理端套餐接口路由与权限守卫）。
  - [x] 编写 `plan.service.spec.ts` 单元测试。
- [x] **2.2 用户订阅与生命周期模块 (`SubscriptionModule`)**
  - [x] 编写 DTO 与校验规则（`SubscribePlanDto`, `UpgradeSubscriptionDto`, `AdminUpdateSubDto`）。
  - [x] 实现 `SubscriptionService`：
    - [x] **1:1 唯一活跃约束保障**：每个用户在任意时刻最多只有一个处于有效周期的订阅。
    - [x] **订购套餐 (`subscribe`)**：首次订购或无有效订阅时生成新实例，计算到期日与初始流量配额。
    - [x] **即时升配 (`upgrade`)**：切换套餐即时生效，重置已用流量、刷新配额上限，并按新套餐周期顺延/重置到期时间。
    - [x] **用户取消订阅 (`cancel`)**：标记状态为 `CANCELED`，保留代理使用权至 `expireAt`，到期后自动注销。
    - [x] **管理员全权控制**：支持后台强制指派套餐、即时吊销（`REVOKED`）、手动充值/清空流量、手动调整有效期。
    - [x] **订阅 Token 重置**：重置 `subscriptionToken`，使旧链接即时失效。
    - [x] **订阅状态联动与定时巡检**：定时扫描过期订阅，更新状态并触发节点白名单同步。
  - [x] 实现 `UserSubscriptionController`（前台用户订阅查询、订购、升配、取消、重置 Token）。
  - [x] 实现 `AdminSubscriptionController`（后台订阅全权管控接口）。
  - [x] 编写 `subscription.service.spec.ts` 单元测试。
- [x] **2.3 订阅模板与可视化规则引擎 (`SubscriptionTemplateModule`)**
  - [x] 编写 DTO 与校验规则（`CreateTemplateDto`, `UpdateTemplateDto`，校验策略组与规则 JSON 语法）。
  - [x] 实现 `TemplateService`：
    - [x] 模板 CRUD 与唯一全局默认模板（`isDefault`）维护逻辑。
    - [x] 预置开箱即用规则库（OpenAI, Netflix/YouTube, 广告拦截, 国内直连, Final 兜底）。
  - [x] 实现 `AdminTemplateController`。
  - [x] 编写 `template.service.spec.ts` 单元测试。
- [x] **2.4 多格式订阅编译引擎重构 (`apps/server/src/subscription/`)**
  - [x] 订阅鉴权与上下文获取：根据 `subscriptionToken` 定位有效 `Subscription`、关联 `Plan` 与授权的 `NodeInbound` 列表，并获取对应的 `SubscriptionTemplate`。
  - [x] **Clash Meta (Mihomo) 编译器重构**：
    - [x] 编译 Proxies 节点列表。
    - [x] 编译 Proxy Groups（Select, URL-Test 自动测速, Fallback 故障转移, Load-Balance 负载均衡），根据模板标签/正则动态关联 Proxies。
    - [x] 编译 Rules 规则集与 DNS / FakeIP 配置。
    - [x] 深度合并 `customInjectYaml` 顶层覆写。
  - [x] **Sing-box Client 编译器重构**：
    - [x] 编译 Outbounds 节点出站。
    - [x] 编译 Selector / URLTest 出站策略组。
    - [x] 编译 `route.rules` 分流规则集与 DNS 配置。
    - [x] 深度合并 `customInjectJson` 顶层覆写。
  - [x] **Base64 编译器重构**：输出标准化 Share Link URI（VLESS/Hy2/SS/TUIC）。
  - [x] 响应标头注入：统一返回 `Subscription-Userinfo`（已用/总量/过期时间）与 `profile-update-interval`。
  - [x] 编写 `subscription-compiler.spec.ts` 单元测试。

---

### 里程碑 3：主从通信扩展与极简 Agent 远程自升级 (`apps/server/agent-gateway` & `apps/agent`)

- [x] **3.1 主控端 WebSocket 网关增强 (`apps/server/src/agent-gateway/`)**
  - [x] 订阅变更与节点配置联动计算：用户订购/升配/吊销时，向在线节点批量推送重新计算的配置。
  - [x] **配置推送防抖批处理器 (Debounce Batcher)**：防止多用户并发操作导致频繁触发节点内核重启。
  - [x] 扩展 WSS 下行指令：新增 `upgrade_task`（下发二进制升级）与 `probe_task`（下发网络诊断）。
  - [x] 扩展 WSS 上行消息处理：解析 `upgrade_result` 与 `probe_result` 并记录节点事件日志。
- [x] **3.2 Go Agent 守护进程自更新与探针实现 (`apps/agent/`)**
  - [x] 扩展消息协议体结构（`upgrade_task`, `upgrade_result`, `probe_task`, `probe_result`）。
  - [x] **安全流式自升级模块 (`upgrade/`)**：
    - [x] 流式下载目标 URL 二进制至临时文件（目标目录下 `.riri-upgrade-*` 临时文件）。
    - [x] 严格比对 SHA256 校验和（不匹配立即删除临时文件并报错上报）。
    - [x] 赋可执行权限（`chmod 0755`）。
    - [x] **Sing-box 内核升级**：调用临时二进制预检现有配置，通过后保留旧版本备份、原子替换并优雅重启；新版本启动失败时回滚并上报错误。
    - [x] **Agent 自身平滑升级**：原子替换自身二进制，保留启动参数重启并重新建连握手。
  - [x] **网络连通性探针模块 (`probe/`)**：
    - [x] 支持下发 TCP 握手耗时探测、DNS 解析测试与 ICMP/Ping 测试。
    - [x] 采集探测延迟（毫秒）并回执 `probe_result`。
  - [x] 编写 Go 单元测试与门禁校验（项目内 Go 工具链等价执行）。

---

### 里程碑 4：管理端 Web 前端开发 (`apps/web` Admin)

- [x] **4.1 节点管理与标签/分权扩展 (`src/pages/admin/nodes/`)**
  - [x] 节点表单增加 Tags 标签输入徽章组件与 Level 节点等级输入。
  - [x] 节点卡片/操作行增加「远程升级 Sing-box」与「远程升级 Agent」按钮，弹出版本输入/升级进度反馈弹窗。
- [x] **4.2 套餐管理界面 (`src/pages/admin/plans/`)**
  - [x] 套餐列表页面（卡片/表格展示：名称、价格、配额、天数、关联节点方式、绑定模板、状态开关）。
  - [x] 套餐创建/编辑弹窗：
    - [x] 基础属性（名称、描述、流量配额、有效期天数、价格）。
    - [x] 节点匹配器（全部节点 / 按标签 / 显式节点 ID）。
    - [x] 订阅模板绑定下拉选择框。
- [x] **4.3 订阅模板可视化设计器 (`src/pages/admin/templates/`)**
  - [x] 模板列表与默认模板标记。
  - [x] 策略组与分流规则 JSON 编辑器：支持 Select / URL-Test 等策略组、节点过滤规则、规则目标与开关。
  - [x] DNS & 客户端通用设置面板（FakeIP、上游 DNS、Clash 运行模式字段）。
  - [x] YAML/JSON 高级覆写注入编辑区（Textarea + 前后端语法校验）。
- [x] **4.4 用户与订阅一体化管理面板 (`src/pages/admin/users/`)**
  - [x] 用户列表聚合当前套餐、订阅状态、流量进度条与到期时间，并支持邮箱、角色、账号状态、订阅状态和套餐筛选。
  - [x] 创建用户支持可选初始套餐；选择套餐自动回填配额与有效期，也可先创建无套餐账号。
  - [x] 综合编辑弹窗拆分为「账号安全」和「订阅管理」双 Tab，支持换套餐、选择无套餐彻底取消订阅、调整流量/状态、增加天数、密码重置与订阅 Token 重置。
  - [x] 移除独立订阅管控页面；保留 `/admin/subscriptions` API 与前端兼容重定向。

---

### 里程碑 5：用户端 Web 前端开发 (`apps/web` User)

- [x] **5.1 个人唯一订阅仪表盘 (`src/pages/user/dashboard/`)**
  - [x] 核心唯一订阅卡片：突出显示当前配额、流量使用进度、状态/有效期和唯一订阅链接。
  - [x] 快捷操作面板：一键复制订阅 URL（Token 隐藏与复制反馈）、重置链接和客户端导入指引。
  - [x] 快速「升配套餐」引导按钮（套餐市场入口）。
- [x] **5.2 套餐商店 / 市场 (`src/pages/user/market/`)**
  - [x] 公开套餐展示网格（流量、有效时长、价格、节点匹配权益）。
  - [x] 订购 / 升配 AlertDialog：区分首次订购与已有订阅，并提示即时生效、流量重置与周期重算。
- [x] **5.3 订阅管理与取消界面 (`src/pages/user/subscription/`)**
  - [x] 订阅详情展示与按套餐匹配的可用节点列表。
  - [x] 重置订阅 Token 按钮（二次防误触确认）。
  - [x] 取消订阅按钮（弹窗提示保留权益至到期日，确认后状态变为 `CANCELED`）。

---

### 里程碑 6：文档同步、质量门禁与全链路端到端验收

- [x] **6.1 文档全量更新**
  - [x] `docs/DATA_MODELS.md`：补充 Plan, Subscription, SubscriptionTemplate 完整模型定义与字段释义。
  - [x] `docs/API_AND_PROTOCOLS.md`：补充套餐/订阅/模板 RESTful API 契约与 WebSocket `upgrade_task` / `probe_task` 协议规约。
  - [x] `docs/ARCHITECTURE.md`：更新主从控制平面与订阅编译架构拓扑。
  - [x] `docs/FRONTEND_UI_GUIDELINES.md` 与 `docs/VISUAL_VERIFICATION.md`：更新前台与后台新增页面的 UI 设计规范与视觉验证台账。
  - [x] `CHANGELOG.md`：在 `[Unreleased]` 记录新架构功能特性。
- [x] **6.2 质量门禁全绿自查**
  - [x] 后端门禁：TypeScript、ESLint、Jest（12 suites / 114 tests）通过。
  - [x] 前端门禁：TypeScript、ESLint、Vite Build 打包通过。
  - [x] Agent 门禁：`go vet`、`gofmt`、`go test`、`go build` 通过；PowerShell 下使用项目内 Go 工具链执行等价命令。
- [x] **6.3 端到端联调与视觉验收准备**
  - [x] 端到端业务链路具备：注册/登录 -> 订购套餐 -> Clash/Sing-box 订阅 -> 升配 -> 取消；由生命周期与编译器回归测试覆盖。
  - [x] 管理端链路具备：创建模板 -> 绑定套餐 -> 按模板输出策略组、规则与 DNS；由模板与编译器测试覆盖。
  - [x] Agent 远程链路具备：下发升级/探针 -> 校验/执行 -> 上报结果；由协议、升级、探针测试覆盖。
  - [x] 前端视觉截图回归：仅在 Antigravity 环境且收到明确视觉验证请求后执行，禁止接入常规 CI/Git Hook。
