# 前端 UI 视觉验证规范与索引台账 (UI Visual Verification Guidelines & Matrix)

本文档定义 **RiriCloud** 前端（`apps/web`）的 UI 视觉验证标准、全量 UI 索引矩阵、变更感知映射规则与 Antigravity 环境下的标准操作规程 (SOP)。

---

## 1. 核心原则与执行策略

1. **按需触发原则 (On-Demand Only)**：
   - 视觉验证**严禁**作为自动化 CI、Git Pre-commit 钩子或常规门禁（`pnpm gate`）的自动检查项；
   - 仅在**用户提出明确视觉走查要求**（例如：“进行一次视觉验证”、“检查 UI 改动效果”、“验证暗黑模式外观”等）时启动。
2. **环境严格限定 (Antigravity Environment Only)**：
   - 视觉验证依赖 Antigravity 提供的专属浏览器自动化（Chrome DevTools MCP）、视口渲染与截屏归档能力；
   - **禁止**在项目中引入 Cypress、Playwright 等重型本地端到端测试依赖，确保零环境污染与轻量极简。
3. **双主题全覆盖 (Dual Themes Mandatory)**：
   - 任何涉及视觉走查的页面/模态组件，必须同时在 **浅色模式 (Light Mode)** 与 **深色模式 (Dark Mode)** 下进行对比验证。
4. **标准化结果交付 (Standardized Artifact Delivery)**：
   - 每次走查完成后，必须输出结构化的 Markdown 报告 Artifact（含受影响变更项高亮、Carousel 截图对比轮播、检查点通过表）。
5. **移动视口覆盖 (Mobile Viewport Coverage)**：
   - 涉及全局布局、Sidebar、Sheet、Table 或页面响应式样式的变更，走查时增加 `375x812` 手机视口与 `768x1024` 平板视口。
   - 手机视口必须确认页面主体无横向溢出；表格仅在表格容器内横向滚动，复杂表单使用全高 Sheet。

---

## 2. 全量 UI 验证索引台账 (UI Verification Matrix)

系统内所有页面、交互模态框及全局组件均纳管于以下索引台账中：

| 索引编号 | 模块分类 | 页面 / 交互单元 | 路由 / 触发方式 | 对应源码路径 | 核心验证检查点 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`UI-01`** | 认证 | 登录页面 | `/login` | `apps/web/src/pages/login/**` | 卡片居中性、Logo 渲染、可选副标题不展示默认开发文案、邮箱/密码正式占位提示、输入框聚焦态、登录后跳转与错误 Toast、忘记密码入口跳转、底栏客服支持联系渠道与页脚版权渲染 |
| **`UI-02`** | 认证 | 注册页面 | `/register` | `apps/web/src/pages/register/**`, `apps/web/src/components/shared/captcha-challenge.tsx` | 表单字段对齐、昵称选填与默认昵称提示、可选副标题不展示默认开发文案、邮箱/密码正式占位提示、密码确认校验、邮箱验证码获取按钮与 60 秒倒计时、本地 SVG CAPTCHA 弹窗/内嵌验证或 Turnstile 状态、返回登录跳转链接、底栏客服支持联系渠道与页脚版权渲染 |
| **`UI-03`** | 控制台 | 根路径重定向 | `/` | `apps/web/src/router/index.tsx` | 登录后访问根路径使用 replace 自动跳转至 `/subscription`，不渲染已下线的仪表盘页面 |
| **`UI-04`** | 用户订阅 | 公告与客户端使用指引 | `/subscription` | `apps/web/src/components/shared/announcement-card.tsx`, `apps/web/src/components/shared/client-guide-card.tsx` | 公告 Markdown 安全渲染、关闭状态本地记忆、无订阅与有订阅状态下均展示客户端三步指引，明暗主题与移动端不溢出 |
| **`UI-05`** | 节点管理 | 节点管理列表 | `/admin/nodes` | `apps/web/src/pages/admin/nodes/index.tsx` | 节点数据表格、内核运行状态 Badge、CPU/内存/带宽遥测实时刷新、统一时区心跳时间展示 |
| **`UI-06`** | 节点管理 | 添加节点弹窗 | `/admin/nodes`（点击“添加节点”） | `apps/web/src/pages/admin/nodes/components/node-form-dialog.tsx` | Dialog 居中、服务器地址与名称输入框、公开开关 Switch |
| **`UI-07`** | 节点详情 | 线路承载与角色列表 Tab | `/admin/nodes/:id` (Tab 1) | `apps/web/src/pages/admin/nodes/detail.tsx` | 当前承载线路、协议徽章、直连/中转/落地角色三态徽章、监听端口与线路状态 |
| **`UI-08`** | 节点详情 | 派生监听端口卡片 | `/admin/nodes/:id` (Tab 1) | `apps/web/src/pages/admin/nodes/detail.tsx` | 线路派生端口按 DIRECT/TRANSIT/LANDING 三态角色展示、消除直连幽灵双端口、端口文本不溢出、无线路时 EmptyState |
| **`UI-09`** | 节点详情 | 基础信息与遥测 Tab | `/admin/nodes/:id` (Tab 2) | `apps/web/src/pages/admin/nodes/detail.tsx` | 节点基础信息编辑、Agent Token、通信模式、Agent/系统架构/内核版本画像、遥测与内核状态、统一时区上报时间 |
| **`UI-10`** | 节点详情 | 高级与运维 Tab | `/admin/nodes/:id` (Tab 3) | `apps/web/src/pages/admin/nodes/detail.tsx` | Line 配置预览、JSON 覆盖编辑器、统一时区网络质量快照、格式化内核错误日志、重启/升级/删除操作 |
| **`UI-11`** | 用户管理 | 一站式用户管理列表 | `/admin/users` | `apps/web/src/pages/admin/users/index.tsx` | UID 与昵称列、邮箱验证状态 Badge（已验证/未验证）、UID 精确搜索和昵称/邮箱实时搜索、角色/账号状态/邮箱验证/订阅状态/套餐筛选（支持「无订阅 NONE」与「无套餐 NONE」精准筛选，状态下拉中英文对照）、套餐 Badge、订阅状态 Badge（有效/已取消/已过期/已吊销/无订阅）、流量进度条、统一时区到期日、流量数据自动刷新、操作列对无订阅用户置灰禁用重置订阅链接按钮并展示「该用户暂无有效订阅」Tooltip 提示、Token 重置确认、管理员防误操作保护 |
| **`UI-12`** | 用户管理 | 创建用户弹窗 | `/admin/users`（点击“创建用户”） | `apps/web/src/pages/admin/users/components/user-form-dialog.tsx` | 邮箱、初始密码、角色选择器、可选初始套餐 Select，纯套餐驱动（彻底移除手动流量配额与到期项输入，无套餐创建 0 配额无订阅用户，绑定套餐自动继承套餐配额与时长） |
| **`UI-13`** | 用户管理 | 综合编辑用户弹窗 | `/admin/users`（点击操作列“编辑”） | `apps/web/src/pages/admin/users/components/user-form-dialog.tsx` | 「账号安全/订阅管理」双 Tab、角色与封禁、邮箱已验证状态切换 Switch、密码重置；订阅管理中无订阅用户隐藏重置订阅链接按钮，无订阅或选择无套餐时自适应隐藏配额/已用流量/到期日/额外线路输入项，展示状态说明或取消警告卡片；无订阅用户提示请选择套餐绑定且未选套餐前保存按钮禁用；已有订阅选择无套餐切换为红色「彻底取消订阅」按钮并触发二次确认弹窗；绑定具体套餐后流畅展开微调输入项与流量重置信息；Token 重置确认 |
| **`UI-14`** | 系统设置 | 系统设置五分类管理面板 | `/admin/settings` | `apps/web/src/pages/admin/settings/index.tsx` | 五个 Tab 响应式切换与 16px 图标、区域与统一时区设置卡片（常用 IANA 候选 + 自定义输入 + 本地实时时钟预览）、SMTP 邮件服务卡片与脱敏密码、注册邮箱验证开关、强制邮箱验证开关（限制订阅与节点连接）、SMTP 测试邮件弹窗与反馈、人机验证模式切换及 Turnstile Site/Secret 配置、主站 URL 强化主从继承说明、移除失效默认流量配额与天数（明确新用户由套餐决定）、订阅与二进制下载 URL 明确为覆盖项、默认模板只读展示与跳转管理、CodeMirror、保存与重置确认、移动端与窄屏视口（375px/320px）防横向溢出与表单组件自动换行/截断适配 |
| **`UI-15`** | 全局框架 | 动态品牌外壳与主题切换 | 全局 Layout / Header / Sidebar | `apps/web/src/components/layout/**`, `apps/web/src/lib/public-settings.ts` | 站点名/Logo、侧边栏底栏客服支持联系弹窗与页脚版权文案、统一时区挂载、动态标题/Favicon/CSS、侧边栏定位、版本号展示、主题三态切换、Sonner Toast 浮层 |
| **`UI-16`** | 套餐管理 | 套餐管理列表 | `/admin/plans` | `apps/web/src/pages/admin/plans/index.tsx` | 套餐卡片信息密度、公开/下架 Badge、节点匹配与模板标签、删除确认 |
| **`UI-17`** | 套餐管理 | 套餐创建/编辑弹窗 | `/admin/plans`（点击“新建套餐/编辑”） | `apps/web/src/pages/admin/plans/components/plan-form-dialog.tsx` | 配额/期限数值输入、流量重置策略 Select、匹配模式 Select、模板选择、公开 Switch、移动端滚动 |
| **`UI-18`** | 模板管理 | 订阅模板列表 | `/admin/templates` | `apps/web/src/pages/admin/templates/index.tsx` | 默认/内嵌 Badge、策略组/规则集/DNS 摘要、复制模板、快速预览抽屉、删除确认 |
| **`UI-19`** | 模板管理 | 订阅模板编辑弹窗与预览 | `/admin/templates`（点击“新建模板/编辑”） | `apps/web/src/pages/admin/templates/components/template-form-dialog.tsx`, `template-groups-editor.tsx`, `template-rules-editor.tsx`, `template-preview-drawer.tsx` | 五 Tab 响应式切换、可视化卡片/CodeMirror 双模、JSON/YAML 语法高亮、编辑区填充剩余高度且内部可滚动、编辑器跟随明暗主题、语义 DNS、Clash/Sing-box 预览切换、复制、统计徽标、默认 Switch、桌面/移动端滚动与双主题 |
| **`UI-20`** | 用户订阅 | 套餐市场 | `/market` | `apps/web/src/pages/user/market/index.tsx` | 套餐权益网格、当前套餐标记、低价套餐禁止直接降级、订购/升配二次确认、窄屏单列 |
| **`UI-21`** | 用户订阅 | 我的订阅综合控制台 | `/subscription` | `apps/web/src/pages/user/subscription/index.tsx` | 公告下方按状态渲染订阅主体或开通引导；有订阅时展示流量进度、状态 Badge、流量重置策略与统一时区下次重置时间、标准/伪静态 Token URL 复制/重置、取消保留权益提示、可用线路紧凑列表（名称/协议/统一时区延迟 Chip/在线状态/倍率）；强制邮箱验证开启且未验证时执行全屏/全宽阻断（彻底隐藏公告、套餐卡片、订阅链接、节点列表及使用指引，替换为大号阻断卡片与原地即时验证弹窗）；无订阅时展示前往套餐市场按钮；小型确认弹窗在移动端保持圆角、左右留白、居中紧凑且 Footer 横向排列 |
| **`UI-22`** | 节点运维 | 远程升级弹窗 | `/admin/nodes/:id`（点击“升级中心”） | `apps/web/src/pages/admin/nodes/components/upgrade-node-dialog.tsx` | 当前/推荐版本对比、主控内置来源、自定义 URL/SHA-256 校验、导入主控、HTTP/WS 任务等待、下发中禁用状态、错误 Toast |
| **`UI-23`** | 线路管理 | 线路管理列表 | `/admin/lines` | `apps/web/src/pages/admin/lines/index.tsx` | 类型/状态/标签筛选、排序、批量启停、全部测速与单行即时测速、延迟 Chip 标签（绿/橙/红/灰四档带 Tooltip 并使用统一时区展示测速时间）、倍率/中继信息、自适应拓扑展示（直连单节点，中继“中转 ➔ 落地”，桥接“中转 ➔ 目标线路”）、覆盖启用状态、删除确认 |
| **`UI-24`** | 线路管理 | 新建/编辑线路双页签弹窗 | `/admin/lines`（点击“新建线路/编辑线路”） | `apps/web/src/pages/admin/lines/components/line-form-dialog.tsx` | 默认“入站配置”页签包含协议/入口节点/监听地址与端口、平面展开的 Transport/TLS/Reality/ACME/专属参数、标准 TLS/ACME 的 ALPN 预设多选、ShadowTLS v3 + SS2022 内层字段、可增删请求头、Reality 密钥生成；Reality 不显示 ALPN；“线路高级设置”页签包含落地拓扑（普通中继配置落地节点/落地监听端口，直连模式自适应隐藏落地设置）、覆盖/倍率/状态；TARGET_LINE 选项显示为“协议转换：桥接已有线路”，并显示目标直连筛选、目标节点/协议/端口摘要且隐藏落地手填字段；两页统一保存 |
| **`UI-26`** | 证书管理 | 证书管理列表与证书操作弹窗 | `/admin/certificates`（点击新建/编辑/查看） | `apps/web/src/pages/admin/certificates/**` | 证书名称、SAN 标签、签发者、统一时区有效期状态展示、关联线路数、PEM 粘贴/上传、解析反馈、私钥查看、引用线路删除拦截 |
| **`UI-27`** | 流量统计 | 全站流量统计 | `/admin/traffic` | `apps/web/src/pages/admin/traffic/**` | 今日/24 小时/7 天/30 天 Tabs、流量与当前速率摘要、平均/峰值速率图、线路/用户 Top 5 + 其他 Donut 切换、线路明细/用户排行 Tabs、邮箱搜索、角色筛选、本地分页、前三名徽标、排行表格数字字段不换行、明暗主题与移动端局部横向滚动 |
| **`UI-28`** | 用户管理与流量统计 | 单用户流量明细下钻 | `/admin/users` 或 `/admin/traffic`（点击“流量明细”） | `apps/web/src/pages/admin/users/components/user-traffic-dialog.tsx` | 用户配额画像、周期走势图、线路占比、明细表格、无记录 EmptyState、桌面 `max-w-5xl` Dialog/移动 Sheet、外层无横向溢出且明细表局部滚动、明暗主题 |
| **`UI-29`** | 用户中心 | 个人中心 | `/profile` | `apps/web/src/pages/user/profile/**` | 顶部 Profile Header 身份横幅（个性化 Avatar、大字昵称弹窗修改、换绑邮箱 Dialog 验证码 60s 倒计时与密码验证、邮箱超长截断带 hover title、状态徽标与「立即验证/更换」按钮防断行 whitespace-nowrap 并在移动端窄屏下整簇折行、数字 UID 复制胶囊、角色徽标、加入时间）；强制邮箱验证开启且未验证时的警告横幅；Tabs 双页签（账号与安全 / 资产与财务）；账号安全页签（登录密码修改、代理凭据 UUID 掩码切换/一键复制/红色危险区域与二次重置弹窗）；资产财务页签（资产三指标概览与卡密兑换并排、全宽收支流水表格、分页与 EmptyState）；客服联系渠道卡片；移动端自适应折行、明暗双主题自适应 |
| **`UI-30`** | 卡密管理 | 卡密管理列表与批量生成/作废交互 | `/admin/redeem-codes` | `apps/web/src/pages/admin/redeem-codes/**` | 状态筛选、元/分单位提示、批量生成表单、生成结果换行复制、统一时区有效期状态、未使用卡密作废确认、移动端表格局部滚动与弹窗内滚动 |
| **`UI-31`** | 资源管理 | 资源管理与资源详情 | `/admin/binaries` | `apps/web/src/pages/admin/binaries/**` | Agent/Sing-box 类型、平台与状态筛选；独立资源版本、来源、默认/启停/归档状态、平台文件 SHA-256 与大小；本地上传、远程导入、资源详情、辅助文件、分发历史；明暗主题与移动端弹窗内滚动 |
| **`UI-32`** | 监控与系统 | 系统日志可视化大盘 | `/admin/logs` | `apps/web/src/pages/admin/logs/**` | 4 大 KPI 指标卡、分级趋势堆叠柱状图、多维过滤器工具栏、高密度等宽日志流表格、Live Tail 实时推流条（悬浮控制、清屏、暂停、自动滚动）、详情抽屉（TraceId 穿透、调用堆栈、格式化元数据）、日志导出与安全清理确认弹窗；明暗主题自适应与移动端防溢出 |
| **`UI-33`** | 认证 | 找回密码页面 | `/forgot-password` | `apps/web/src/pages/forgot-password/**` | 找回密码表单居中对齐、邮箱/新密码/确认密码输入校验、邮箱验证码获取按钮与 60 秒倒计时、人机验证弹窗防刷保护、重置成功后跳转登录页与反馈 Toast、返回登录跳转链接、底栏客服支持联系渠道与页脚版权渲染 |

---

### 2.1 移动端附加检查项

所有受影响索引在 `375x812` 与 `768x1024` 下追加检查：

- 页面主体、卡片和 Header 不产生非预期横向滚动。
- 移动端 Sidebar 能打开、关闭，并在导航后自动收起。
- 普通弹窗保留两侧留白并可在内部滚动，复杂编辑弹窗切换为全高 Sheet。
- 表格完整保留字段，横向滚动限制在表格容器内。
- Tabs、筛选器、批量操作和危险操作按钮不重叠、不被裁切。

---

## 3. Git Diff 变更映射与走查范围判定

当开发者或 AI Agent 修改前端代码时，应根据改动文件的路径映射确定受影响的 UI 索引范围：

```mermaid
flowchart TD
    Change[前端代码修改 apps/web/src/**] --> PathCheck{路径类型判断}
    PathCheck -->|全局组件 / 样式\ncomponents/ui/*\ncomponents/layout/*\nsrc/index.css| Full[全量走查: UI-01 ~ UI-32]
    PathCheck -->|认证模块\npages/login/*\npages/register/*| Auth[精准走查: UI-01, UI-02]
    PathCheck -->|根路径与订阅控制台\nrouter/index.tsx\npages/user/subscription/*\ncomponents/shared/*| Dash[精准走查: UI-03, UI-04, UI-21]
    PathCheck -->|节点模块\npages/admin/nodes/*| Node[精准走查: UI-05 ~ UI-10]
    PathCheck -->|用户模块\npages/admin/users/*| User[精准走查: UI-11 ~ UI-13, UI-28]
    PathCheck -->|流量模块\npages/admin/traffic/*| Traffic[精准走查: UI-27]
    PathCheck -->|设置模块\npages/admin/settings/*| Sett[精准走查: UI-14]
    PathCheck -->|套餐模块\npages/admin/plans/*| Plans[精准走查: UI-16, UI-17]
    PathCheck -->|模板模块\npages/admin/templates/*| Templates[精准走查: UI-18, UI-19]
    PathCheck -->|用户订阅\npages/user/*| UserSubs[精准走查: UI-20, UI-21, UI-29]
    PathCheck -->|个人中心\npages/user/profile/*| Profile[精准走查: UI-29]
    PathCheck -->|卡密管理\npages/admin/redeem-codes/*| Redeem[精准走查: UI-30]
    PathCheck -->|节点升级\npages/admin/nodes/components/upgrade-node-dialog.tsx| Upgrade[精准走查: UI-22]
    PathCheck -->|线路管理\npages/admin/lines/*| Lines[精准走查: UI-23 ~ UI-24]
    PathCheck -->|证书管理\npages/admin/certificates/*| Certificates[精准走查: UI-26]
    PathCheck -->|系统日志\npages/admin/logs/*| Logs[精准走查: UI-32]
```

### 映射规则表

| 修改的代码路径 (Glob Pattern) | 关联受影响的 UI 索引 | 走查级别 |
| :--- | :--- | :---: |
| `apps/web/src/index.css`, `tailwind.config.js` | `UI-01` ~ `UI-32`（全站所有页面） | **全量** |
| `apps/web/src/components/layout/**`, `theme-toggle.tsx` | `UI-01` ~ `UI-32`（全局框架与主题） | **全量** |
| `apps/web/src/components/ui/**` | 依赖该原子组件的所有页面 | **全量 / 宽范围** |
| `apps/web/src/pages/login/**`, `register/**` | `UI-01`, `UI-02` | **增量** |
| `apps/web/src/router/index.tsx` | `UI-03`, `UI-21` | **增量** |
| `apps/web/src/pages/admin/nodes/**` | `UI-05`, `UI-06`, `UI-07`, `UI-08`, `UI-09`, `UI-10` | **增量** |
| `apps/web/src/pages/admin/users/**` | `UI-11`, `UI-12`, `UI-13`, `UI-28` | **增量** |
| `apps/web/src/pages/admin/traffic/**` | `UI-27` | **增量** |
| `apps/web/src/pages/admin/settings/**` | `UI-14` | **增量** |
| `apps/web/src/lib/subscription-url.ts` | `UI-03`, `UI-14`, `UI-21` | **增量** |
| `apps/web/src/components/layout/site-runtime.tsx`, `apps/web/src/lib/public-settings.ts` | `UI-01` ~ `UI-03`, `UI-14`, `UI-15`, `UI-21` | **增量** |
| `apps/web/src/pages/admin/plans/**` | `UI-16`, `UI-17` | **增量** |
| `apps/web/src/pages/admin/templates/**` | `UI-18`, `UI-19` | **增量** |
| `apps/web/src/pages/user/**` | `UI-20`, `UI-21`, `UI-29` | **增量** |
| `apps/web/src/components/shared/announcement-card.tsx`, `client-guide-card.tsx` | `UI-04`, `UI-21` | **增量** |
| `apps/web/src/pages/user/profile/**`, `apps/web/src/components/shared/quick-redeem-form.tsx` | `UI-29` | **增量** |
| `apps/web/src/pages/admin/redeem-codes/**` | `UI-30` | **增量** |
| `apps/web/src/pages/admin/nodes/components/upgrade-node-dialog.tsx` | `UI-22` | **增量** |
| `apps/web/src/pages/admin/binaries/**` | `UI-31` | **增量** |
| `apps/web/src/pages/admin/lines/**` | `UI-23`, `UI-24` | **增量** |
| `apps/web/src/pages/admin/certificates/**` | `UI-26` | **增量** |
| `apps/web/src/pages/admin/logs/**` | `UI-32` | **增量** |

---

## 4. Antigravity 视觉走查标准操作规程 (SOP)

当用户发出视觉验证指令后，AI Agent 需按以下标准步骤执行：

### Step 1: 环境检查与就绪
1. 确认后端服务（`http://localhost:3000`）与前端服务（`http://localhost:5173`）正常监听；
2. 确保数据库已初始化并完成本地演示 seed（默认管理员账号：`admin@riricloud.local`，密码：`riri-admin-demo`）；生产环境使用 `.env` 中显式配置的管理员凭据，不依赖演示默认值。

### Step 2: 浏览器视口与会话初始化
1. 依次将浏览器页面视口调整至 `1440x900`、`375x812` 和 `768x1024`；
2. 导航至 `http://localhost:5173/login`，使用管理员账号登录进入主控面板。

### Step 3: 按判定范围遍历 UI 矩阵
1. 根据 Git Diff 确定的待验证索引范围（增量或全量），依次导航或触发对应的页面及模态框；
2. 对每个目标视图，执行浅色模式 (Light) 与深色模式 (Dark) 的截屏捕获。

### Step 4: 检查点与视觉规范核对
对照 [docs/FRONTEND_UI_GUIDELINES.md](FRONTEND_UI_GUIDELINES.md) 核实以下核心要素：
- [ ] **排版与边距**：容器间距均匀，无内容溢出或非预期换行；
- [ ] **弹窗尺寸**：普通表单宽度统一，复杂编辑弹窗保持适度宽度，移动端有两侧留白且超长内容可在弹窗内滚动；
- [ ] **移动端交互**：Sidebar 抽屉可开关，导航后自动收起；Sheet、Tabs、筛选器和表格在 `375x812` 下可操作；
- [ ] **横向滚动边界**：页面主体无横向溢出，宽表格只在其自身容器内滚动；
- [ ] **语义颜色**：文字与背景对比度合格，无硬编码 HEX 色彩或色彩失真；
- [ ] **组件规范**：全部使用 shadcn/ui 组件，无原生裸 HTML 交互标签；
- [ ] **无障碍与交互**：模态框遮罩层正确显示，支持 Escape 键关闭与焦点捕获；
- [ ] **主题切换**：明暗主题切换流畅，无残留白色/黑色色块。

### Step 5: 输出标准化验证报告 Artifact
在当前对话 Artifact 目录生成 `ui_visual_verification_report.md`，使用 `carousel` 标签嵌入全量/增量走查对比截图，并列出各检查点通过状态表。

---

## 5. 维护与更新约定

1. **新增页面/模态框时**：必须在同一 PR 中向本文件「2. 全量 UI 验证索引台账」追加新的 `UI-xx` 索引项与源码路径映射；当前套餐/订阅相关视图登记为 `UI-16` 至 `UI-24`，用户中心与卡密管理登记为 `UI-29` 至 `UI-30`，资源管理登记为 `UI-31`，管理员订阅履约已归入用户管理的 `UI-11` 至 `UI-13`。
2. **重构/删除页面时**：必须同步更新索引台账，保持文档与代码绝对一致。
