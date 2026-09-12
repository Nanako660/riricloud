# 更新日志 (Changelog)

本项目的所有显著变更都记录在本文件中。

格式基于 [Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/)，
版本管理遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/) 与
[docs/VERSIONING.md](docs/VERSIONING.md)（最小递增原则、统一版本号、Tag 与本文件一一对应）。

变更类型说明：`Added` 新增 · `Changed` 变更 · `Fixed` 修复 · `Removed` 移除 · `Security` 安全 · `Deprecated` 弃用。
约定：日常特性与修复 PR 在 `[Unreleased]` 中维护更新条目；正式发版时运行 `pnpm bump` 固化为版本小节并按小节打 `vX.Y.Z` Tag。


## [Unreleased]

### Added
- **无公网 NAT/家宽主机作为落地出口节点与反向穿透隧道全链路**：
  - **网络可达性模型与业务约束**：`Node` 实体扩展 `reachability`（`PUBLIC` | `NAT`），`Line` 实体扩展 `allowLanAccess`、`tunnelType`、`tunnelPort` 与 `tunnelSecret`。服务端严格校验拓扑合法性，禁止将无公网的 NAT 节点作为直连入站或中继入口节点，仅允许作为中继落地出口节点，将家庭宽带与无公网 NAS/PC 原生 IP 盘活为解锁落地机。
  - **Node-to-Node 聚合反向隧道编排**：主控端实现多线路单隧道聚合编排机制，同一对 `(entryNode, landingNode)` 之间复用单一持久长连接与动态隧道端口；在 `config_sync` 中实时向公网入口 VPS 下发服务端监听配置（自动将中继出站目标重定向至本地隧道转发端口），向落地 NAT 节点下发客户端主动反向拨号配置（业务入站监听强制绑定至 `127.0.0.1`）。
  - **家庭局域网安全沙箱与拦截**：落地 NAT 节点作为出口时，若 `allowLanAccess` 为 `false`（默认策略），Master 在生成的 Sing-box 配置中自动注入首位私网阻断路由规则（`geoip:private`），彻底切断外部翻墙用户窥探家庭 NAS、路由器后台等内网资产的安全隐患；仅当管理员显式开启「允许访问落地端局域网资源」时放行私网流量。
  - **前端管理与向导体验升级**：节点列表新增「公网 VPS / NAT 落地」徽标与反向隧道状态说明；添加节点弹窗支持可达性单选与自适应地址输入；线路创建/编辑向导支持落地选择 NAT 节点，自动展示「NAT 安全反向穿透」拓扑卡片与局域网访问安全开关。
- **用户密码复杂度策略全面可配置**：系统设置「注册与用户」新增密码复杂度要求区块，小写字母、大写字母、数字、特殊字符四个必含开关（`passwordRequire*`）与密码最小长度共同构成密码策略，对注册、找回密码、修改密码与管理员建户/重置密码全场景生效，全部关闭时仅校验长度；默认策略放宽为「须含小写字母与数字」，不再强制大写与特殊字符。服务端按设置动态构建校验正则并移除 DTO 层硬编码强度规则，公开设置透出策略供前端动态校验与占位提示，`admin:reset` 与首管理员 bootstrap 脚本同步遵循配置策略。
- **卡密管理批量操作、统计与导出能力**：新增 `GET /admin/redeem-codes/stats` 四态互斥汇总统计（未使用/已兑换/已作废/已过期的数量与合计金额，管理页顶部统计卡片直读）；新增 `GET /admin/redeem-codes/export?format=csv|txt` 按当前筛选导出卡密（CSV 含全部审计字段、TXT 仅卡密行，附件下载，单次上限 10000 条）；新增 `POST /admin/redeem-codes/batch-revoke` 行选择批量作废（最多 500 张，仅未使用状态生效并返回命中/跳过计数）与 `POST /admin/redeem-codes/cleanup` 过期卡密清理（默认删除过期超过 30 天且未使用的卡密，已兑换与已作废记录永久保留）。
- **卡密管理操作审计与兑换限流**：管理员批量生成、单张作废、批量作废与清理操作统一写入系统日志（`module=REDEEM_CODE`，含操作者与数量参数，卡密明文严禁入日志）；`POST /user/wallet/redeem` 接入进程内限流器（按用户 5 次/分钟），超限返回 429，抬高卡密爆破成本。
- **二进制资源中心管理能力补全**：资源中心（`/admin/binaries` 资源管理页）补齐完整生命周期——新增 `PATCH` 编辑备注与兼容性约束、`DELETE` 物理删除（仅限非内置、非启用且无分发历史的资源，事务清理 DB 行并删除 RUNTIME 磁盘文件，有分发历史的资源引导使用归档保留审计）、归档恢复出口 `restore`（RETIRED → DISABLED）、停用/归档默认资源时在同一事务自动把默认标记转移给同类型最新 ACTIVE 资源、批量启用/停用/归档/删除（逐项返回成功与失败原因）、审计日志查询 API（补全操作者昵称/邮箱）；平台 target 枚举收敛为服务端唯一事实来源（`binary-targets.ts`，与 `build-agent.sh` 发布矩阵一致），DTO 校验、旧版分发仓与前端下拉全部派生自同一常量，不再接受枚举外的 armv7 等不可达平台。
- **资源管理页重构为服务端查询与完整生命周期操作**：列表改为服务端分页/搜索（版本号或备注，400ms 防抖）/筛选（类型/平台/状态），平台选项来自接口返回的 `supportedTargets`；新增行多选与批量工具栏（危险动作二次确认）；上传/导入表单重写为 react-hook-form + zod 并提供字段级错误提示，上传模式选择文件后浏览器自动计算 SHA-256（计算中禁用提交）；资源详情弹窗展示备注与兼容性约束徽标，分发记录升级为分页列表（支持状态筛选与失败任务就地重试）；新增「操作审计」弹窗（分页、动作筛选、操作者展示）。
- **节点升级分发记录可视化与任务重试/回滚入口**：新增 `GET /admin/nodes/:id/tasks` 分页查询节点升级分发任务；节点详情「高级与运维」Tab 新增「升级分发记录」卡片（状态筛选、版本/操作/尝试次数/错误信息、失败或完成任务可重试、有历史版本的任务可回滚并二次确认），补齐此前前端从未接入的 `tasks/:taskId/retry` 与 `rollback` 能力。
- **免费套餐重复购买限制与终身购买台账**：套餐新增 `purchaseLimitPerUser`（`null` 不限购）与 `allowRenewal` 配置；新增 `PlanPurchaseIdentity`、`PlanPurchaseEmailAlias` 与 `PlanPurchase` 持久化台账，并将购买身份与可删除账号解耦。自助订购、升配、注册默认套餐和管理员发放统一记账，唯一约束负责并发去重；取消、过期、升配、管理员删除账号后重新注册均不能再次领取已用尽免费套餐，管理员补发可破例但必须留下 `ADMIN` 来源记录。
- **套餐卡片高阶视觉流派方案与后台完全可配置化**：吸纳 Aceternity UI 与 Magic UI 业界顶流视觉设计精髓，全面落地三大高阶流派方案（`cardStyle`：`fusion` 尊享流光合璧、`holographic` 全息黑曜 3D 闪卡、`neon` 赛博霓虹导光晶体）。在套餐管理后台（`PlanFormDialog`）新增流派方案卡片式三选一交互配置，管理员可自由为各个套餐独立指定专属流派，右侧实机预览即时联动；`PlanCardConfigDto` 同步扩展 `cardStyle` 字段契约并支持 Swagger 与 class-validator 校验；全新引入物理阻尼 $\pm 6^\circ$ 的细腻 3D Tilt 视差微倾斜、1.5px 极细微导光流动微边框容器（Shine Border）、高透动态全息彩虹晶格折射（Holographic Foil）以及双层环境霓虹光晕（Ambient Neon Bloom），浅色模式适配为典雅通透的珠光白玉微晶质感（Pearlescent Frost），彻底解决原有大面积深暗色调发脏发浊痛点，达成流光溢彩且极度奢华沉稳的高阶质感。
- **预设流派基线与折叠式「高级视觉微调」抽屉面板**：在套餐管理后台（`PlanFormDialog`）实现“预设流派 + 折叠式高级微调面板”双层交互架构。选择任一流派自动一键载入对应最佳基线配置，展开折叠面板可对 5 项原子能力（3D 视差微倾斜 `enable3DTilt`、1.5px 流光微边框 `enableShineBorder`、全息彩虹折射 `enableHolographic`、双层环境霓虹 `enableAmbientGlow`、流体极光内衬 `enableAurora`）进行毫秒级独立微调开关，微调后卡片流派自动转为自定义模式；服务端 DTO 与客户端类型无缝兼容并提供向后平滑过渡。

### Changed
- **卡密管理页体验升级**：列表接入服务端分页（修复原 pageSize 硬编码 100 导致超量卡密不可见）与 400ms 防抖卡密搜索；新增兑换人（昵称/邮箱）与兑换时间列，兑换审计无需再反查用户流水；卡密列默认掩码显示（保留前缀段与末 4 位），提供眼睛图标明文切换与行内复制，避免旁观截屏泄露；批量生成重构为候选码预生成 + 碰撞预检 + 单事务 `createMany`，消除最多 1000 次串行 insert 的长事务持锁。
- **资源中心列表 API 服务端分页化**：`GET /admin/binary-resources` 响应由资源数组调整为 `{ data, total, page, pageSize, supportedTargets }` 分页包，新增 `page/pageSize/search/kind/status/platform` 查询参数；列表行不再内嵌最近分发任务（改用 `deploymentCount` 汇总，任务详情走分页的 deployments 接口），`GET /admin/binary-resources/:id/deployments` 同步支持分页与状态筛选。
- **套餐市场与我的订阅卡片全面升级为高透玻璃质感与真实物理光照体系**：彻底消除原有大面积深暗泥泞底色（告别深色模式发浊暗渐变与浅色模式泛黄塑料感），卡片底色回归纯净通透的微透磨砂底（浅色纯白天光，深色深空曜石高透）；引入物理光照高光模型，包含卡片顶部 1px 晶体棱线导光条（Chamfered Top Rim Specular Line）、自上向下柔和漫射的物理天光（Top Ambient Light）以及随鼠标平滑移动的双层物理镜面反射追踪聚光灯（Dual-Layer Specular Spotlight）；各套餐主题色（极速蓝、星云紫、金珀香槟等）仅作为光线穿透介质时的局部棱镜折射彩光（顶部漫射、微发光边框、晶体图标底座），绝不污染主体大背景；移除割裂的价格深色独立小框使其与通透卡片浑然一体；特性列表图标告别彩虹杂色撞色并统一跟随卡片主题折射色轻盈点缀；按钮升级为晶体微透发光按键，大幅提升「当前使用中」与「暂不支持降级」等禁用状态文字的对比度与呼吸感。
- **管理后台套餐表单界面降噪与空间精炼**：彻底移除原有容易引起认知混淆的旧版 `animationEffect` 动效下拉配置项，消除流派与动效的语义冲突；清理流光光色与角标选择器内的英文括号技术备注，回归极简中文语义；将原本挤占表单与预览区底部的特性清单语法指南卡片收纳为 Label 旁的小问号 `Tooltip` 悬浮气泡，右侧所见即所得实机卡片预览拥有更舒展从容的垂直对齐空间。

### Fixed
- **dev-e2e 联调密钥与数据库生命周期绑定**：`scripts/dev-e2e.sh` 未显式提供 `JWT_SECRET` 时改为按数据库 URL 维度生成并持久化密钥（`.cache/dev-e2e-secrets/`，同一联调库始终复用同一密钥），修复联调数据库跨运行复用后 Master-Local AgentToken 无法解密（`Unsupported state or unable to authenticate data`）导致 e2e 启动失败的问题。
- **卡密文案与实际行为对齐**：个人中心「卡密区分大小写」提示修正为「卡密不区分大小写」（服务端早已统一大写归一）；卡密管理页「卡密只会在生成后显示一次」表述与列表明文展示相矛盾，随列表默认掩码 + 明文切换机制一并修正。
- **本地联调 SQLite 写锁规避与数据库复用隔离**：`scripts/dev-e2e.sh` 默认改用独立的 `dev-e2e.db`，不再与手动启动的开发主控争用 `dev.db`；迁移与种子命令改为从 server 工作区执行，并记录联调数据库身份，避免错误复用旧主控。
- **套餐续费与购买计数口径修复**：续费不再消耗限购次数，但 `allowRenewal=false` 时服务端拒绝；目标套餐与当前套餐相同的升配请求改为提示使用续费，杜绝通过重复升配刷新周期和流量。存量免费套餐迁移为限购 1 次且不可续费，未来新建或改价为 0 元的套餐自动采用相同安全默认。
- **套餐卡片被激活状态与流光微边框硬裁剪及重叠冲突根除**：修复套餐市场中当前在用套餐卡片（`isCurrent`）的高亮边框（`ring`）与 1.5px Shine Border 流水光束互相挤压撕扯、且被容器 `overflow-hidden` 硬裁剪边缘的缺陷；将 `isCurrent` 高亮光环与景深阴影（`ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg shadow-primary/20`）提升至卡片最外层独立包装容器，内层晶体卡片与流动光槽保持独立无缝渲染，形成外层激活光环与内层光槽导光的和谐视觉纵深。


## [0.8.7] - 2026-09-12

### Changed
- **套餐卡片与订阅卡片背景重构为对角全色彩深度渐变**：全面重塑套餐市场卡片与「我的订阅」主卡片背景渐变方案，将原有的垂直渐隐底色重构为从左上到右下（135° 对角线 `bg-gradient-to-br`）的完整主题色彩深度填充渐变，深色模式赋予沉浸式暗夜宝石多色相覆盖，浅色模式赋予温润明澈水彩流转；同时将卡片内部次级容器（价格面板与 4 块指标小卡片）升级为微透磨砂玻璃容器（`backdrop-blur-sm bg-white/40 dark:bg-black/25`），让底层对角流光与极光光池自然隐隐透出，彻底告别局部渐隐与中性惨白底色。

### Fixed
- **套餐卡片视觉配置 DTO 补齐 syncToSubscription 字段校验**：在 `PlanCardConfigDto` 中补齐 `@IsBoolean() @IsOptional() syncToSubscription` 属性定义，修复管理员编辑或保存套餐时因 NestJS `ValidationPipe` 严格白名单校验抛出 `400 (cardConfig.property syncToSubscription should not exist)` 导致无法保存的缺陷。



## [0.8.6] - 2026-09-12

### Added
- **「我的订阅」卡片特效同步全局与套餐双层开关控制**：新增全局系统设置 `subscriptionEffectsSyncEnabled`（系统设置 -> 订阅与客户端分发 Tab），允许管理员一键决定全站用户「我的订阅」主卡片是否同步当前套餐的流体极光与晶体漫射微边框特效；同时在套餐管理视觉配置（`PlanCardConfig`）中增设套餐级细粒度开关 `syncToSubscription`（默认开启），支持针对主推旗舰款开启特效同步、基础款保持低调；用户端在开关关闭时平滑无缝降级为经典极简原生卡片，彻底满足不同管理员与用户对界面沉浸感与极简实用性的个性化偏好。
- **套餐卡片全维度视觉定制与炫酷动效系统**：在 `Plan` 数据模型中新增 `cardConfigJson` 字段（对应 `PlanCardConfig`），全面支持 7 款质感主题色（极简暗黑、尊享金、极速蓝、星云紫、碧翠绿、炽热红、星空靛）、12 款专属 Lucide 矢量图标（Zap、Rocket、Crown、Shield、Sparkles、Flame、Globe、Gauge、Gem、Server、Cpu、Plane 等，彻底杜绝 emoji）、纯 CSS GPU 加速环绕流光边框（Border Beam，支持主题单色与炫彩霓虹 Rainbow 双模）、鼠标光斑追踪（Spotlight）、呼吸弥散光晕（Ambient Pulse）、行动按钮金属微光扫光（Shimmer）、划线原价对比与折扣优惠徽章（立省百分比/折扣文本）、自定义行动按钮文案以及微标记特性清单语法解析（`[zap]`, `[rocket]`, `[crown]`, `[shield]`, `[sparkles]`, `[star]`, `!加粗`）。
- **管理端套餐编辑「所见即所得」实机即时预览 (Live Preview)**：在套餐管理创建/编辑弹窗（`PlanFormDialog`）中增设视觉与营销配置独立分区，并于右侧（桌面端）内置所见即所得卡片即时预览区，管理员切换主题色标、图标、动效模式、原价、文案与开关时，实机卡片与动效即时动态联动刷新，并附带微标记语法指南小贴士。
- **用户端套餐市场周期快捷筛选与紧凑排版重构**：在 `/market` 顶部新增周期筛选快捷 Tab 栏（全部 / 月付 $\le 31$ 天 / 季与半年 $32\sim 180$ 天 / 年付 $>180$ 天）并展示各周期实时计数；接入现代化 `MarketPlanCard`，去除大量空旷留白，赋予紧凑美观、动感十足的自适应卡片流排版，并提供账户当前在用套餐与余额横幅。
- **套餐管理自定义市场展示与权益多样化**：在 `Plan` 模型、服务端与套餐表单中增加推荐角标文本（`badgeText`，如 HOT、推荐、特惠）、主推推荐套餐标记（`isFeatured`）与自定义权益特性清单（`features` / `featuresJson`，支持快捷预设标签一键填入）；用户端套餐市场（`/market`）无缝支持主推套餐高亮与微光边框视觉引导、醒目推荐角标胶囊以及自定义权益特性逐条渲染，并在特性清单未配置时自动平滑降级展示系统 4 项基础特性。
- **节点管理即时搜索与多维状态筛选**：在 `/admin/nodes`（节点管理）中新增节点名称与主机地址关键词模糊搜索框，并提供通信状态（全部/在线/离线/已禁用）与内核运行状态（全部/运行中/已停止）下拉筛选器，工具栏排版与全站其他数据表格统一。
- **直连代理池多节点自动化代码与轮换池生成**：在用户中心 `/proxy-pool` 的自动化代码中支持多出网节点场景，提供「多节点轮换池」与「指定单节点」双模式切换；多选节点时默认生成包含已选有效节点的 `PROXIES_POOL` 列表及随机轮换调用代码（覆盖 Python `random.choice`、Playwright 字典列表、Node.js 随机选取及 Shell 批量 `for` 循环测试与单行随机调用），并在 macOS 终端标题栏提供微型节点切换器（$\le 2$ 节点平铺为 Tab 药丸，$> 2$ 节点自动收拢为下拉选择框），可随时一键切为任意单节点的独立调用代码。

### Changed
- **套餐卡片双模高饱和主题背景加深**：重构 `cardBgClass` 注入深浅自适应的整卡主题色彩浸润，浅色模式赋予温润的水彩纸渐变底色（`from-[color]-50/90 via-[color]-100/35 to-card/95`），深色模式赋予深邃星云宝石微透渐变底色（`dark:from-[color]-950/45 dark:via-card/85 dark:to-card/90`），边框高亮对比度加深，彻底解决卡片背景色在纯白或纯黑模式下过淡、缺乏质感的视觉缺陷，使卡片一眼即可明确识别其专属主题。
- **「我的订阅」卡片视觉美化与原生交互规范回归**：主卡片无缝接入套餐卡片同款流体极光、晶体漫射微边框（Crystal Sheen）与主题渐变底色，同时**完全尊重并保留卡片内部原生交互排版规范**：标题区恢复精简利落的标准文本与状态 Badge；操作按钮（「续费此套餐」、「升配或变更套餐」）完全还原原生 `variant="outline"` 按钮，杜绝不必要的重渐变侵入；4 块核心指标方块回归原生标准 `bg-muted/20` 清爽排版，实现顶级氛围背景与极简实用主义界面的完美平衡。
- **套餐卡片光晕视觉升级（流体极光与微透磨砂）**：重塑套餐卡片动效体系，将原有 1.5px 机械旋转边框升级为顶级「北欧极光流体光池 (Nordic Aurora Orbs)」与「晶体边缘漫射折射 (Crystal Sheen)」，内置双层慢速有机游走光晕（8s~16s 多维平滑缩放与深度高斯模糊）、顶部 1px 倒角微光折射线（Chamfered Edge Light）、微透半透明磨砂面板以及半透微折射晶体按钮（Smoked Glass Button，带外发光与金属扫光，彻底去除刺眼的大实心塑料色块），动效模式文案升级为「流体极光」、「晶体微光漫射」与「北欧极光 + 晶体漫射」，在用户端市场与管理端实机即时预览中提供深邃、奢华的科技质感。
- **套餐管理页面表格化重构与即时检索**：将 `/admin/plans`（套餐管理）由原有超大双列卡片平铺全面重构为标准数据表格（DataTable），补齐名称/标签/描述即时模糊搜索框与公开状态（全部/仅公开/已下架）下拉筛选器，表格清晰呈现套餐信息与角标、资费与周期、流量配额与重置策略、线路匹配模式与范围、绑定模板及公开状态，常用编辑与删除操作对齐系统规范。
- **订阅模板与资源管理页面布局数据表格化重构**：将 `/admin/templates`（订阅模板）与 `/admin/binaries`（资源管理）从双列超大平铺卡片布局全面重构为紧凑、标准的数据表格（DataTable）模式。订阅模板新增名称与描述即时搜索、策略/规则集/DNS/高级覆写紧凑指示、常用操作外露与更多菜单收纳；资源管理新增版本号即时搜索、多平台架构徽标紧凑聚合（超量 +N 折叠与完整体积 Tooltip）、总体积与引用分发次数汇总、详情与启停外露及归档二次确认，大幅提升管理效率与信息密度。
- **资源管理搜索筛选工具栏样式全站统一**：重构 `/admin/binaries` 工具栏排布，移除孤立的边框卡片容器，改用与线路管理、节点管理、证书管理高度一致的平铺响应式流式工具栏，保证全站管理视图层级与交互一致性。
- **全 TLS 节点互斥锁定与协议防错**：当已选的所有出网节点均开启 TLS（带 `HTTPS` 徽章）时，界面自动将导出协议切为 `HTTP (HTTPS)` 并将 `SOCKS5` 选项置为禁用状态并展示说明，从源头杜绝标准 SOCKS5 客户端因协议不兼容导致的 `curl: (97)` 握手失败。
- **混合节点 SOCKS5 智能过滤与透明提示**：当同时勾选部分 TLS 与部分明文节点并选择 `SOCKS5` 协议时，自动化代码与代理池中自动过滤出仅支持明文的节点，并在终端窗口上方展示黄色提示条说明过滤详情，确保复制的代码 100% 可连通执行。

### Fixed
- **套餐卡片移除底部多余降级提示文本**：移除套餐市场卡片中当目标套餐价格低于当前套餐时底部多余且破坏网格高度一致性的「目标套餐价格低于当前套餐，暂不支持直接降级」冗余段落；行动按钮自身已明确展示「暂不支持降级」且处于置灰禁用状态，移除后消除卡片底部冗余留白，保障所有卡片在网格流中绝对齐平整洁。
- **套餐卡片与管理端实机预览浅色模式 (Light Mode) 视觉重构与色彩饱和度升级**：彻底解决浅色模式下卡片泛白、幽灵淡按钮、极光过淡不可见等视觉缺陷；浅色模式下行动按钮全面重塑为高饱和鲜艳渐变实体按钮（如暖金、极速冰蓝、星云紫等配对应主题色柔和发光投影与高对比字色），极光流光不透明度提升至 80% 呈现鲜活灵动的水彩极光，价格区域引入呼应主题的微润渐变浅底与清晰微边框，卡片外圈增加主题彩色弥散浮雕投影与利落彩色边框，同时 100% 保持深色模式（Dark Mode）广受好评的顶级暗夜极光微透晶体质感不变。
- **直连代理终端代码视窗点击文本选中交互优化**：移除终端工作台代码视窗容器的强制全选（`select-all`）类名，改用常规文本选择（`select-text`）；点击代码区域不再意外触发全局选中遮盖，用户可根据需要自由圈选局部文本或使用顶部的独立复制按钮快捷复制。
- **移动端侧边栏无法滚动与高度自适应修复**：修复在移动端（`< md`）通过 Sheet 打开侧边导航栏时因缺少弹性列布局（`flex-col`）与视口高度约束（`h-full max-h-svh`）导致菜单内容超出视口且无法滚动触达底部「监控与系统」及页脚信息的缺陷；为 `SidebarContent` 添加 `overflow-y-auto` 与 `overscroll-contain`，底栏增加浅色分隔线并声明 `shrink-0`，保障手机端抽屉菜单滚动平滑顺畅。
- **直连代理终端控制栏与 Chip 布局移动端响应式重构**：重构 macOS 终端风格工作台在窄屏（$\le 375\text{px}$）下的控制栏排布，解决模式切换 Tab 与「下载/复制」按钮重叠碰撞问题；桌面端维持单行紧凑布局不变，移动端第一行精简为纯粹的红黄绿圆点与 Tab 切换，提取模式下第二行展示格式微标与操作按钮，代码模式下第二行横向平滑滚动多语言药丸与常驻复制代码按钮，第三行优雅承载出网节点切换 Chip 与下拉框。



## [0.8.5] - 2026-09-11

### Added
- **独立 Mixed (SOCKS5/HTTP) 直连代理池**：新增 `ProxyKey` 独立凭据模型与 `proxy-pool` 服务端模块（`ProxyPoolService`、用户端与管理端控制器），面向爬虫、指纹浏览器多开与脚本工具提供标准的 `socks5://` / `http://` 直连代理能力，与面向客户端翻墙的订阅体系完全解耦；不暴露账号密码、UUID 与订阅 Token，用户可创建多条凭据（单账号上限 20 条），每条拥有独立的高熵 `pk_` 用户名与密码、独立 `exportToken` 免登录拉取令牌与独立启停开关。
- **来源 IP/CIDR 白名单防盗刷**：凭据可绑定最多 64 条 IPv4/IPv6 地址或 CIDR 网段白名单，服务端严格校验格式并在节点 `route.rules` 中生成 `logical/and` 反选拒绝规则，命中凭据但来源不在白名单的连接被直接拒绝。
- **直连代理池多格式导出与免登录拉取**：新增 `GET /api/v1/user/proxy-pool/export`，支持 `IP:Port:User:Pass` 纯文本（指纹浏览器一键导入）、`socks5://` / `http://` URI 逐行列表与含节点名称/地区/延迟快照/协议/凭证的 JSON 对象数组；该端点同时声明 `@Public()` 与 `@OptionalAuth()`，可凭 Cookie 登录态或 `?token=<exportToken>` 免登录定时同步。
- **用户中心直连代理页面**：新增 `/proxy-pool` 页面与侧边栏「直连代理」导航，提供凭据管理列表（密码掩码切换与复制、白名单徽章、已用流量、启停 Switch、轮换密码/令牌、删除二次确认）与提取导出中心（节点多选、SOCKS5/HTTP 协议切换、三格式导出预览、Python `requests` / Playwright / Node.js `axios` / Shell `cURL` 多语言代码片段、自动化定时拉取 URL 一键复制）。
- **管理端直连代理池审计接口**：新增 `GET /admin/proxy-pool/overview`、`GET /admin/proxy-pool/keys` 与启停/删除接口，支持按名称、用户名、用户邮箱检索与累计流量聚合。
- **直连代理池凭据级流量账务**：`TrafficLog` 新增可空 `proxyKeyId` 归属字段，凭据累计计费流量与主账户、订阅在同一 SQLite 事务内更新，并同步刷新 `ProxyKey.lastUsedAt`。
- **直连代理池按需 TLS**：`mixed`/`socks`/`http` 入站支持 `params.tls`（标准 TLS 可关联证书中心证书或节点本地路径，亦支持 ACME），线路表单同步开放「关闭 / 标准 TLS / ACME」三态安全模式（不提供不适用于本地代理协议的 Reality）。

### Changed
- **直连代理池控制台现代化重构与移动端深度适配**：全面重构用户端 `/proxy-pool` 界面，增设 4 项微型状态指标卡（活跃凭据、可用端点、双协议支持、主账户结算）；拆分为响应式双 Tab 选项卡（「代理提取与代码集成」与「凭据与白名单管理」），彻底解决移动端无休止长滑；凭据列表升级为响应式卡片网格与等宽紧凑代码胶囊（消除全宽拉伸、新增发光状态微灯与行内快捷复制）；代理提取区域升级为 macOS 终端风格一体化工作台，节点选择改为轻量流式芯片标签，支持在多格式文本结果与四语言自动化代码间平滑切换、一键复制及一键下载 `.txt` 文件；**支持 HTTP 代理 HTTPS/TLS 自动识别**：服务端与前端自动识别线路 TLS 开启状态，在 URI 导出与 Python/Playwright/Node.js/cURL 代码片段中智能输出标准 `https://` 代理语法，节点芯片高亮 `HTTPS` 协议标签。
- **Mixed/SOCKS/HTTP 入站强制鉴权**：生成节点配置时对这三类协议一律启用用户认证。Sing-box 中 `users` 为空的 `mixed`/`socks`/`http` 入站等价于开放代理，属于安全红线，因此不再接受 `params.usersEnabled = false`。
- **超额熔断即时生效**：流量账务批次入账后触及配额的账号会立即触发全局 `config_sync`，其订阅凭证与直连代理凭据在数秒内同步吊销。

### Fixed
- **直连代理池凭据必须冒号安全**：Sing-box 的 HTTP CONNECT 认证走 Go `net/http.parseBasicAuth`，按首个 `:` 切分用户名与密码，`socks5://user:pass@host` 与 `http://user:pass@host` 的 userinfo 解析行为一致；因此入站认证用户名固定使用裸 `pk_xxxx`，不追加 `::lineId` 复合后缀，避免两种 URI 形态认证必然失败（线路归属改由节点级活动线路解析确定，`parseTrafficCredential` 仍保留复合解析能力）。
- **白名单规则不得使用顶层 `invert`**：来源 IP 白名单以 `logical/and` 内层 `invert` 表达「命中凭据但来源不在白名单」。若在顶层规则反转，会把同入站的其他凭据与订阅用户流量一并拒绝，误伤整条入站。



## [0.8.4] - 2026-09-11

### Added
- **节点全生命周期系统事件日志**：在 `AgentGatewayService` 中为节点核心运维事件补齐结构化日志上报入库：包括 Agent 节点上线（`INFO`）、异常掉线/断开（`WARN`）、配置同步生效结果与错误详情（`INFO`/`ERROR`）、组件版本远程升级成败（`INFO`/`ERROR`）以及 Agent 重启任务结果（`INFO`/`WARN`），使按节点筛选真正具备端到端运维排查价值。
- **系统日志排查体验与快捷过滤联动**：日志列表表格支持点击节点 Badge 直接过滤该节点、点击 `[module]` 标签直接过滤该模块；当存在搜索关键词时在消息摘要中实现关键词精准安全高亮；详情侧滑抽屉中新增“按此节点过滤”与“按此模块过滤”快捷联动按钮；过滤控制栏支持显示当前活跃模块徽标与一键重置筛选条件。

### Changed
- **日志自查读取静默策略**：服务端 `HttpLoggingInterceptor` 对正常的日志自查读取请求（`/api/v1/logs*` 且状态码 `< 400`）静默放行不写入系统日志，仅在 4xx/5xx 出错时记录，避免管理员查看日志本身产生大量刷屏访问日志。

### Fixed
- **系统日志管理端路由 404 与节点筛选失效**：修复 `apps/web/src/pages/admin/logs/index.tsx` 中请求节点列表接口使用错误的 `/nodes` 导致 `Cannot GET /api/v1/nodes` 404 报错的问题，修正为规范的 `/admin/nodes`；彻底解决因节点加载失败导致日志筛选工具栏中节点下拉项为空、无法按节点筛选日志的问题。
- **SSE Live Tail 实时推流票据协议对齐与双兼容**：修正 `useLiveTailStream` 请求 `stream-ticket` 接口使用 GET 与服务端 POST 声明不匹配导致的推流失败；服务端同时提供 `@Get('stream-ticket')` 与 `@Post('stream-ticket')` 双通道支持，前端统一规范为 POST。
- **前端日志异常上报隔离与防自循环污染**：在 `apps/web/src/lib/api.ts` 的 Axios 响应拦截器中将 404 错误上报级别调整为 `WARN`，避免客户端 404 探测或失误污染系统 24 小时 ERROR 大盘指标。



## [0.8.3] - 2026-09-11

### Added
- **Sing-box 规则集现代解耦（GeoIP 升级为 rule_set）**：在 `apps/server/src/subscription/builders.ts` 中将 Sing-box 1.8+ 弃用并在 1.12+ 彻底移除的 `type: "geoip"` 路由规则全面重构为现代独立规则集 `rule_set`（自动指向官方 `sing-geoip` 发布的预编译 `.srs`），彻底根治 `parse rule: geoip database is deprecated in sing-box 1.8.0 and removed in sing-box 1.12.0` 致命报错。
- **订阅模板双内核真实验证诊断（Sing-box + Mihomo）**：服务端模板预览端点（`POST /admin/subscription-templates/preview`）重构为双内核并发真实验证；新增 `checkMihomoConfig`，通过隔离临时目录调用 `mihomo -t` 执行配置真实验证，并剥离 ANSI 颜色乱码；支持多层级探测 `MIHOMO_BINARY_PATH`、本地 `.tools/mihomo/` 与系统 PATH；Docker 运行时环境声明 `MIHOMO_BINARY_PATH=/usr/local/bin/mihomo`。
- **订阅模板源文件双模编辑与无损互转（JSON / YAML）**：`TemplateSourceEditor` 支持「JSON 源码」与「YAML 源码」无损双向切换编辑，CodeMirror 语法高亮与语法诊断实时同步，支持格式化美化、防污染脏数据隔离守卫与一键复制；前端预览抽屉（`TemplatePreviewDrawer`）同时展示 Sing-box 与 Mihomo 两枚内核状态徽章与多源诊断卡片。
- **Docker 构建自动内置 Mihomo 内核**：在 `Dockerfile` 中新增 `mihomo-fetch` 多阶段构建，根据目标架构（`amd64` / `arm64`）自动下载并校验 Mihomo 官方 Release 二进制，安装至容器 `/usr/local/bin/mihomo` 与静态基线仓；`scripts/docker-build.sh` 补充对应构建参数；Master 镜像开箱即用支持双内核验证。
- **源文件编辑优先展示 YAML 源码**：`TemplateSourceEditor` 默认语言调整为 `'yaml'`，分段器选项卡将 `[YAML 源码]` 移动至首位，大幅提升 Clash/Mihomo 模板配置体验。

### Fixed
- **Mihomo 配置诊断避免触发远程 GeoData 下载**：修复 `checkMihomoConfig` 在分析包含 `GEOSITE` / `GEOIP` 规则时因缺少本地 geodata 触发外部下载导致的 5 秒超时报错；测试前对相关规则类型进行纯分析模式语法占位，诊断耗时稳定在 10ms 以内。



## [0.8.2] - 2026-09-11

### Added
- **订阅模板工作台沉浸式重构**：模板编辑弹窗（`TemplateFormDialog`）全面升级为 6-Tab 统一沉浸式布局（「基本信息」、「策略组设计」、「分流规则」、「DNS 设置」、「客户端高级覆写」、「源文件编辑」）。
- **策略组与分流规则沉浸式顶栏**：`TemplateGroupsEditor` 与 `TemplateRulesEditor` 顶栏重构，提供可视化/源码切换、状态徽标、6 种常用预设一键添加菜单（主流节点组、自动优选、流媒体、广告拦截等）与格式化美化。
- **结构化 DNS 列表与主流预设**：新增 `TemplateDnsEditor`，国内直连 DNS 与海外代理 DNS 支持徽章标签管理、增删、一键引入公共 DNS/DoH 预设（阿里、腾讯 DNSPod、Cloudflare、Google、Quad9 等）与一键重置。
- **客户端高级覆写全宽工作台与智能片段**：新增 `TemplateOverrideEditor`，支持 Clash YAML 与 Sing-box JSON 二级切换并占满 100% 宽度与高度，集成实时语法校验状态指示与常用配置片段（TUN 模式、Clash API 控制器等）智能 deepMerge 注入。
- **全模板 JSON 源文件双向编辑**：新增 `TemplateSourceEditor`，支持在源文件 Tab 中直接查看与编辑整套模板的结构化 JSON（策略组、分流规则、DNS 与客户端覆写），与各表单 Tab 毫秒级双向安全同步，具备语法错误防污染守卫、格式化美化、一键复制与快速渲染验证联动。
- **Sing-box 内核真实验证与智能诊断**：服务端模板预览端点（`POST /admin/subscription-templates/preview`）支持在系统就绪时自动调用 `sing-box check -c` 进行真实内核配置校验，并在预览抽屉（`TemplatePreviewDrawer`）中展示内核校验状态徽章、错误调用日志与配置诊断；未探测到内核时无缝降级为语法诊断。
- **Sing-box 1.12+ 现代 DNS 格式与 Fake-IP 规范迁移**：重构 `buildSemanticSingboxDns` 与 `parseSingboxDnsServer`，废弃顶层 `dns.fakeip` 与 `independent_cache`，所有 DNS 服务器解析为强类型服务器对象（支持 UDP、DoH、DoT、DoQ、H3、local）；Fake-IP 采用新型结构挂入 `dns.servers` 并将直连 DNS 作为默认首位解析器；`route` 配置中补充 `default_domain_resolver: "dns_direct"`，彻底解决 Sing-box 1.12+ 内核校验报错。
- **内核诊断输出 ANSI 脱敏与分级高亮**：主控调用 `sing-box check` 时追加 `--disable-color` 参数并应用正则彻底剥离终端 ANSI 颜色转义序列，解决 `[31mERROR[0m` 乱码；前端预览抽屉实现 `FATAL`/`ERROR`/`WARN` 语义化标签与分级日志高亮展示。

### Changed
- **前端表单初始化契约与机械守卫**：新增 `apps/web/src/hooks/use-form-reset.ts`（`useFormResetOnKey`），弹窗与编辑面板统一按「打开弹窗 / 切换编辑对象」初始化草稿一次；`eslint.config.js` 新增 `no-restricted-syntax`，禁止在 `useEffect` 内初始化表单、禁止把 query 的 `.data` 对象放进 effect 依赖（规范见 `docs/FRONTEND_UI_GUIDELINES.md` §4.2 B8 与 §5.1）。

- **开发联调默认端口调整**：`scripts/dev-e2e.sh` 的主控端联调端口由 `3000` 调整为 `30800`，避开 Windows 系统保留端口区间（本机 `2940-3039` 覆盖 `3000`）造成的端口漂移；应用自身默认端口不变（仍为 `3000`），该调整仅作用于联调脚本。

### Fixed
- **Sing-box 订阅多 DNS 生成丢弃与旧格式截断修复**：修复 `buildSemanticSingboxDns` 在用户配置多个直连与代理 DNS 时仅截取首个地址并丢弃后续地址的缺陷，现完整生成 `dns_direct`、`dns_direct_N`、`dns_proxy`、`dns_proxy_N` 服务器列表；同时修复旧 Clash 格式回退时若存在 fallback 会截断 nameserver 的缺陷。
- **模板编辑移动端单行横滑与语法报错排版优化**：模板弹窗 Tabs 选项卡在小屏幕视口下保持单行排布并支持横向平滑滚动；全套编辑器（源文件、高级覆写、策略组、分流规则）状态徽章精简为紧凑型状态指示（`格式正常` / `语法错误`），长报错信息统一移至底部并升级为深色终端语法诊断卡片，彻底避免挤占右侧操作按钮。
- **镜像站弹窗输入被轮询清空（0.8.1 未根治的复发）**：`/admin/mirrors` 新增/编辑弹窗输入后约 5 秒被节点列表轮询重置；现迁移为 React Hook Form + Zod 并按业务身份初始化，出网节点选项保持实时刷新而不再回写用户输入。
- **节点详情表单被 5 秒轮询回写**：节点名称、对外地址与覆盖配置 JSON 每 5 秒被详情轮询覆盖，现按 `node.id` 初始化一次，遥测、内核状态与错误回执继续实时刷新。
- **同类隐患收敛**：系统设置页与证书编辑弹窗改为按 `dataUpdatedAt` + `isDirty` 回灌（后台 refetch 不再清空未保存修改），个人中心昵称草稿加 dirty 守卫；线路/套餐/模板/节点创建/节点升级弹窗统一改走 `useFormResetOnKey`；探针弹窗改用独立 queryKey（原与设置页共用 key 但响应形态不同，会污染设置缓存）；资源导入弹窗把「类型与平台联动」移入选择事件，删除派生数组入依赖的写法。

- **开发联调端口竞态与残留进程修复**：`scripts/dev-e2e.sh` 现将实际使用的主控端口记录到 `.cache/dev-e2e-server-port`，后续运行据此复用已在运行的主控端，避免端口漂移后重复拉起并抢占同一端口（原表现为 `listen EADDRINUSE` 后直接失败）；端口在探测与绑定之间被抢占时会顺延到下一个可用端口自动重试（可用 `SERVER_START_ATTEMPTS` 调整次数，显式固定 `SERVER_PORT`/`PORT` 时不顺延）；退出时按进程树回收（Windows 使用 `taskkill /T`），不再残留 `nest`/`sing-box` 子进程占用端口；并修正 StatsService 端口未变化时仍打印“默认端口不可用”的错误提示。

### Security
- **生产环境 API 文档默认安全收敛**：主控端 Swagger / OpenAPI 接口文档（`/api/docs` 及 `/api/docs-json`）在生产部署环境（`NODE_ENV=production` 或 `RIRICLOUD_ENV=production`）下默认彻底禁用挂载并返回 404，防止系统指纹与接口全景暴露；开发与测试环境保持默认开启，并新增 `ENABLE_SWAGGER`（兼容 `RIRICLOUD_ENABLE_SWAGGER`）支持按需显式开启；Nginx 示例配置同步增加可选的反代层拦截注释规则。
- **`multer` 传递依赖强制升级**：新披露 3 条 High DoS advisory（`GHSA-wc9g-mqfw-jrwm`、`GHSA-qfvm-cv95-jqjf`、`GHSA-535w-7cp7-47q4`）影响经 `@nestjs/platform-express` 传递引入的 `multer@2.2.0`；因 NestJS 11.x 最新版仍精确依赖该版本，改由根 `package.json` 的 `pnpm.overrides` 强制 `multer@2.3.0`（临时安全锁定，待上游依赖 `>=2.3.0` 后移除，说明见 `docs/TECH_STACK.md` §3.2）。



## [0.8.1] - 2026-09-09

### Fixed
- **镜像站管理表单输入修复**：修复新增/编辑镜像站弹窗因节点列表引用变化反复重置表单，导致输入框、下拉选择和开关无法操作的问题。



## [0.8.0] - 2026-09-09

### Added
- **实时节点镜像站**：新增可复用 MirrorSite、ADMIN/SHARE/PUBLIC 访问策略、指定 WS/WSS Agent 节点的实时 GET/HEAD 流式代理、重定向域名白名单、Range/条件请求支持、限速与 SSRF 防护，以及 `/admin/mirrors` 管理页面。
- **Agent 镜像代理能力**：新增 `mirror_proxy` 能力宣告、Master-Agent 镜像任务协议、二进制响应分片、取消清理和节点级并发/大小/时长限制。

### Changed
- **统一 Linux 开发机工具链策略**：Node.js、pnpm 与 Go 改为系统安装，pnpm/npm/Prisma/Go 缓存使用用户默认路径；`scripts/dev-env.sh` 仅为 Windows Git Bash 保留仓库内兼容缓存与便携工具链。
- **Master 与 Agent 的 Release 发布流水线与产物彻底解耦**：
  - 改造 `scripts/release.sh`，发布产物目录按目标隔离为 `artifacts/packages/master` 与 `artifacts/packages/agent`，避免历史产物残留与校验和交叉污染；
  - Master 发布（`pnpm release:master`）仅编译装配主控生产包所需的单目标架构（`linux-amd64`）内置二进制，不再交叉编译其他平台 Agent，GitHub Release (`vX.Y.Z`) 仅挂载 `riri-master_${VERSION}_linux_amd64.tar.gz` 与单项校验和，不再附带各架构 Agent 压缩包；
  - Agent 发布（`pnpm release:agent`）专用于构建并上传 5 大平台的 `riri-agent_${AGENT_VERSION}_*` 压缩包与对应校验和至 `agent-vA.B.C`；
  - 在 `package.json` 中新增 `release:master` 与 `release:agent` 便捷命令，对齐双轨版本治理规范。

### Fixed
- **修复 Linux 开发联调误选 Windows Sing-box**：`scripts/dev-e2e.sh` 按操作系统与 CPU 架构过滤内核候选，并通过 `sing-box version` 验证可执行性，自动复用 Linux 缓存或回退构建，不再因 `.exe` 文件优先导致 `Exec format error`。



## [0.7.1] - 2026-09-07

### Fixed
- **订阅线路下发与节点 Agent 心跳状态彻底解耦**：
  - 订阅与套餐可用线路判定改以线路自身的启用状态（`status=ACTIVE`）及中继目标状态为唯一基准，移除对 `node.status === 'ONLINE'` 的强依赖及 60 秒重启宽限期过度设计；
  - 避免节点 Agent 因短暂心跳超时、网络抖动或正在重启导致其承载的可用线路被全量从客户端订阅中剔除，交由客户端本地测速（`url-test` / `fallback`）进行自适应健康检查与节点切换；
  - 优化 `AgentGatewayService.buildConfigSync` 配置同步逻辑，移除中继线路对对端节点在线状态（`otherNodeOnline`）的不必要阻断，确保中转与落地节点的端口转发与协议入站规则持续稳定下发。
- **服务端线路测速全链路与协议自适应降级**：
  - 修复 Master 镜像分离后缺失 `sing-box` 内核导致端到端代理测速失效的问题，在 Master 容器中恢复 `/usr/local/bin/sing-box` 与 `SINGBOX_BINARY_PATH`（仅作为 CLI 探针调用，维持与 Agent 守护进程解耦）；
  - 引入内部测速专用凭据（`INTERNAL_SPEEDTEST_UUID` / `SECRET`），在节点配置同步中自动注入并在心跳统计中过滤，杜绝虚构凭据导致的鉴权失败与用户流量污染；
  - 实现协议自适应降级：对于 Hysteria 2、TUIC 等纯 UDP 协议，在端到端探测受阻时不盲目发起 TCP 握手，消除对 UDP 端口发送 TCP SYN 导致的误导性 `connect ECONNREFUSED` 报错；对 Master 本机节点测试失败增加详细排查指引。



## [0.7.0] - 2026-09-07

### Added
- **Master 与 Agent 独立版本治理**：拆分主控与边缘程序版本管理，新增 `pnpm bump:agent` 系列脚本与 `agent-vA.B.C` Tag 体系；`pnpm gate:version` 与发布脚本深度支持双轨校验与分流发布。
- **Docker 协同编排与镜像注入**：Docker Compose 默认协同拉起独立 `master` 与 `agent` 容器；支持通过 `AGENT_IMAGE` 注入 Agent 镜像与 `MASTER_LOCAL_AGENT_TOKEN` 环境变量自动对接本机节点。
- **节点 Docker 部署支持**：管理端节点添加、详情与 Token 轮换弹窗新增原生 CLI 与 Docker 容器启动双 Tab 切换，`installCommands` 增加 `dockerWs` 与 `dockerHttp` 支持。

### Changed
- **主控与边缘守护进程彻底解耦**：Master 容器与自包含发行包移除内置 Agent 进程的联锁托管，Master 镜像仅暴露 3000 端口，专精于控制面与 Web 面板；构建期保留当前平台二进制注入 `/app/binaries/` 以维持私有离线分发能力。
- **系统版本接口感知增强**：`GET /api/v1/system/version` 返回 `{ version, agentVersion, agentImage }`，同步感知主控版本、推荐 Agent 版本与镜像。

### Fixed
- **Docker 容器环境系统版本与分发清单推导**：修复 Master 容器中因独立 deploy 缺少根版本导致版本接口返回 0.0.0 的问题，构建期注入 package.json 版本、binaries/manifest.json 与 AGENT_VERSION 回退；修复节点管理中 Docker 示例命令挂载路径错误。



## [0.6.14] - 2026-09-07

### Fixed
- **本地 e2e 管理员登录修复**：`scripts/dev-e2e.sh` 现在优先读取显式或 `apps/server/.env` 中的 `ADMIN_EMAIL`/`ADMIN_PASSWORD`，兼容旧的 `SEED_ADMIN_*` 配置；复用已有数据库时不再强制使用失效的演示密码，并将登录 401/429 与网络错误转换为明确提示。
- **Docker 内置 Agent 路径修复**：启动内嵌 Agent 时显式传入独立的 Agent 配置路径，并将日志与运行数据统一放入 Master 持久化目录；Compose 同步注入兼容路径变量，避免非 root 容器误写 `/var/lib/riri-agent` 导致主控启动循环。
- **节点管理 AgentToken 轮换闭环**：补齐远程节点轮换入口、旧凭证立即失效与在线连接断开，并在管理台一次性展示新 Token 和不内嵌凭证的 WS/HTTP 安装命令；Master-Local 继续禁止普通轮换。



## [0.6.13] - 2026-09-06

### Fixed
- **密码强度校验补齐**：注册、找回密码、个人修改密码和管理员创建/重置用户密码统一要求密码同时包含大写字母、小写字母、数字和特殊字符，并同步前端表单提示、DTO 校验与服务端动态最小长度校验；既有弱密码仍可正常登录。
- **e2e 管理员导航状态修复**：统一侧栏、管理员路由守卫与用户菜单使用服务端 `/auth/me` 会话数据，避免管理员账号在个人中心显示“系统管理员”但因过期内存角色导致全部管理员菜单消失。
- **登录注册安全审计整改**：本地图形验证码改为 SQLite 服务端短期状态并使用不可逆 HMAC，加入过期、一次性消费、IP 绑定、失败次数和并发保护；邮箱验证码改为 hash 存储并使迁移前明文验证码全部失效；注册/找回密码统一邮箱归一化、错误语义、动态密码长度、密码强度、CAPTCHA 与限流边界。
- **浏览器认证会话硬化**：登录/注册改用 HttpOnly、SameSite Cookie，移除前端 localStorage JWT；注销、改密、重置、禁用和管理员 CLI 重置递增 `sessionVersion` 立即失效旧会话，并补充 API no-store、CSP、CORS 与安全响应头。
- **e2e Cookie 登录适配**：`scripts/dev-e2e.sh` 与资源同步脚本改用权限受限的临时 Cookie jar，不再读取登录响应中的 `accessToken` JSON。
- **本地 e2e 联调凭证修复**：节点列表脱敏后，`scripts/dev-e2e.sh` 改为通过本地 Prisma helper 读取 `Master-Local` AgentToken，避免复用旧配置导致内嵌 Agent 鉴权失败；既有独立节点缺少显式 AgentToken 时改为明确报错。
- **本地 e2e 资源同步修复**：复用已有主控或 SQLite 数据库时，自动校验当前 Agent/Sing-box 构建产物并创建新的资源 revision，避免升级任务使用旧文件或因 SHA-256 不一致失败。
- **安全审计整改**：AgentToken 改为 CSPRNG 生成、哈希校验与 AES-GCM 密文保存，创建/轮换时仅返回一次，轮换立即断开旧连接；移除 Agent/JWT query 鉴权，Agent 二进制与 WS 统一使用 Header，SSE 日志改用一次性短期票据。
- **认证与输入洪泛防护**：补齐登录、注册、密码重置、验证码和前端日志限流，验证码失败次数使用 SQLite 原子更新，Agent WS 与日志上报增加帧大小、消息数量、metadata 和队列配额，密码/禁用/重置后旧 JWT 立即失效。
- **网络与部署安全**：远程二进制下载增加 DNS 私网/元数据地址阻断、逐跳重定向校验、HTTPS 策略与流式大小限制；生产入口拒绝 `AUTO_SEED=true`，容器和发行包增加非 root、只读根文件系统、capability drop、no-new-privileges 与临时文件系统约束。
- **敏感配置保护**：SMTP、Turnstile、证书私钥和 Reality 私钥使用 AES-GCM 应用层加密，管理端响应与线路输出脱敏；补充安全响应头、明确 CORS、CSP、HSTS、nosniff、Frame 防护与 no-store 策略。
- **供应链与依赖治理**：锁定 `qs` 修复版本、升级 React Router，固定 Docker 基础镜像 digest 并校验 Sing-box/Cronet SHA-256；记录 `deepmerge-ts` 经 Prisma 配置链路引入的残余 High 风险与持续监控计划。



## [0.6.12] - 2026-09-06

### Added
- **强制邮箱验证与订阅隔离防护机制**：
  - **动态门禁与平滑过渡**：系统设置新增「强制邮箱验证」（`enforceEmailVerification`）开关（默认关闭）；开启后，未完成邮箱核验的普通用户访问订阅接口（`GET /api/v1/sub/:token`）将被 HTTP 403 阻断并提示「请先完成邮箱验证后使用订阅服务」。
  - **节点数据平面凭证动态过滤**：Master 服务端在编译分发 Sing-box 节点配置时，自动剔除未验证普通用户的代理凭证（UUID），并订阅设置变更广播即时推送全节点热更新，彻底阻断未验证用户的节点入站连接。
  - **管理员特权豁免**：管理员账号（`role === 'ADMIN'`）享受最高优先级豁免保护，即便处于未验证状态亦不受订阅拉取拦截与节点凭证剔除影响，避免误操作导致运维失联。
- **全链路找回密码（Forgot Password）**：
  - **独立重置密码页与安全风控**：新增 `/forgot-password` 路由与登录页直达链接；集成图形验证码（本地 SVG）与 Cloudflare Turnstile 防刷机制，有效抵御邮件轰炸。
  - **即时核验联动**：输入 6 位重置验证码与新密码重置成功后，自动将历史未验证用户标记为已核验（`emailVerifiedAt = now()`），顺带解除订阅禁用并引导返回登录。
- **存量用户自主核验与管理端协同**：
  - **用户端自主核验**：个人中心新增邮箱核验状态胶囊徽标与「立即验证」弹窗，支持一键发送验证码即时完成当前邮箱认证；换绑邮箱成功后自动流转为已验证。
  - **我的订阅页强提醒与锁定**：在强制核验开启且当前用户未验证时，订阅页面顶部呈现醒目预警横幅，锁定订阅卡片并提供一键唤起验证弹窗入口。
  - **管理端全景感知与干预**：管理后台「用户管理」列表新增邮箱验证状态列与多维状态筛选下拉菜单；管理员支持在用户编辑弹窗中直接切换核验状态，便于人工客服与应急排障。

### Changed
- **我的订阅与个人中心未验证提示优化**：
  - **文案与语意统一**：将全站未验证场景下的“阻断”表述统一调整为更温和准确的“暂不可用”（标题统一为「邮箱未完成验证，订阅与代理服务暂不可用」，正文统一为「当前账号邮箱尚未通过验证。在完成邮箱验证前，您的订阅更新与节点连接暂不可用。」）。
  - **订阅页不可用全景聚焦与视觉居中**：在未验证状态下隐藏左上角「我的订阅」标题及二级描述，移除多余的重复徽标，并将居中卡片上移微调至黄金人眼视觉中心（Optical Center），极大改善移动端与桌面端的视觉排版与聚焦感。
- **登录按钮语义化图标补齐**：登录页面提交按钮文本前补齐标准 `<LogIn />` 图标，与全局表单提交按钮设计规范对齐。

### Fixed
- **个人中心移动端邮箱与操作按钮排版修复**：优化个人中心名片栏在窄屏与长邮箱下的排版表现，严格为状态徽标及「立即验证」、「更换」按钮添加 `whitespace-nowrap shrink-0` 约束，彻底根除中文字符被挤压为两行纵向断行（“立即验\n证”、“更\n换”）的视觉缺陷；长邮箱支持自适应截断并保留 hover title 提示，在屏幕空间不足时支持操作按钮整簇优雅折行。
- **管理用户弹窗状态开关布局与样式优化**：彻底移除账号状态与邮箱验证开关中硬编码的 `h-9`（36px）固定高度与多余占位标签，重构为带说明的自适应状态卡片（`rounded-lg border p-3 shadow-xs`），根除图文挤压与多列参差不对齐问题。
- **更新带订阅用户时 BigInt 序列化 500 异常修复**：修复 `UsersService.updateUser` 在更新拥有订阅的用户时，漏将嵌套的 `subscription.trafficLimitBytes` / `trafficUsedBytes` 转换为 Number，导致 JSON 序列化抛出 `Do not know how to serialize a BigInt`（HTTP 500）的根本缺陷；统一提炼 `formatAdminUser` 序列化方法并补充单元测试回归。



## [0.6.11] - 2026-09-06

### Added
- **全栈可视化日志管理系统与全链路追踪**：
  - **三端覆盖与统一存储**：构建覆盖 Master 服务端（API 访问拦截、系统核心事件、未捕获异常）、Web 前端（未捕获全局 JS 异常、Promise 拒绝、API 4xx/5xx 与关键交互）以及 VPS 边缘节点（Agent 运行状态、配置同步失败、内核异常退出）的三端日志体系；严格遵循轻量嵌入式 SQLite 零外部中间件红线，基于内存防抖环形缓冲批量持久化（`createMany`）与双上限生命周期滚动淘汰（`logsRetentionDays` / `logsMaxCount`）。
  - **全链路 TraceId 穿透追踪**：实现统一 `X-Request-Id`（TraceId）在前端 Axios 客户端、服务端 HTTP 日志拦截器与持久层日志记录间的双向透传，支持从任意前端异常或 API 报错一键关联定位全调用链路。
  - **低延迟 Live Tail 实时推流**：基于服务端原生 SSE（`GET /api/v1/logs/stream`，支持 URL Token / Bearer 鉴权）与 RxJS Subject 广播通道，实现毫秒级日志推流；前端配备悬浮控制器，支持推流暂停/恢复、日志清屏与跟随滚动。
  - **全功能现代化可视化大盘（`/admin/logs`）**：提供 4 大 KPI 关键指标卡（总日志数、24h 错误数、24h 警告数、API 平均响应耗时）、24 小时级别趋势堆叠柱状图、多维过滤器工具栏（时间跨度、日志级别、日志来源、节点、关键词与 TraceId）、高密度等宽日志表格、滑出式详情抽屉（Formatted Stack Trace / JSON 元数据 / TraceId 穿透关联）以及日志导出（JSON/CSV）与安全清理模态框。
  - **不可逆强敏感脱敏引擎**：内置专用脱敏工具，入库及推流前全量不可逆模糊化 Bearer Token、系统密码、AgentToken、SubscriptionToken 与 Cookie 等敏感凭据，杜绝凭据泄漏。
- **用户系统完善**：新增全局唯一 6 位数字 UID、可选昵称与默认昵称回退；注册支持邮箱验证码、SMTP 发信、本地 SVG CAPTCHA 和 Cloudflare Turnstile；个人中心支持昵称修改与邮箱换绑，管理员用户列表支持 UID/昵称检索。
- **系统安全配置**：新增 SMTP 服务、注册邮箱验证和 CAPTCHA 模式设置，SMTP 密码与 Turnstile Secret 在管理端读取时统一脱敏，并支持发送测试邮件。

### Changed
- **个人中心体验重构**：采用“顶部名片式身份横幅 + Tabs 双页签（账号与安全 / 资产与财务）”现代化架构，新增大尺寸个性化 Avatar 头像、大字昵称轻量弹窗修改、加入时间与 UID 复制胶囊；代理连接凭据（UUID）支持明文/掩码一键切换与危险重置二次确认；资产概览与卡密兑换并排呈现，收支明细升级为全宽舒展流水表格，彻底消除卡片高度失衡与空洞。
- **管理后台侧边栏结构化分组重构**：将原本平铺散落的 10 个管理模块按业务心智解耦为「业务运营」（用户/套餐/卡密）、「网络与节点」（节点/线路/证书/模板/资源）与「监控与系统」（流量统计/系统设置）三大结构化子分组，显著提升导航扫读效率与信息架构清晰度。

### Fixed
- **本地人机验证可读性**：验证码数字改为彩色渲染并增加浅色背景，提升深色模式下的辨识度。
- **个人中心浅色质感与弹窗响应式修复**：优化浅色模式下头像与可用余额卡片背景质感，消除半透明黑色黑雾暗角；修复 `DialogContent` 在移动端丢失圆角的问题（补充基础 `rounded-lg`），并修复 `DialogFooter` 在移动端下按钮全宽反向堆叠的问题（保持紧凑横排靠右与自然宽度）。



## [0.6.10] - 2026-09-05

### Added

- **管理端流量统计新增用户侧分析**：流量大盘新增用户 Top 100 排行、邮箱与角色筛选、用户占比 Donut 图，以及从排行行原地打开用户配额与线路明细下钻。



## [0.6.9] - 2026-09-05

### Added

- **全项目统一时区配置体系（`systemTimezone`）**：
  - 系统设置中新增统一时区配置（默认 `Asia/Shanghai`），支持常用 IANA 时区快速选择与自定义合法 IANA 时区录入，并提供本地预览时钟与服务端校验（`Intl.DateTimeFormat` 合法性验证）。
  - 全链路统一生效：前端全局公共 `formatDateTime` 与 `formatDate` 格式化工具接入动态时区上下文，彻底替代零散的浏览器本地 `toLocaleString`，并在全站（管理端节点、证书、用户、卡密与用户端订阅、流水明细、延迟 Chip 等）全面对齐统一时区展示；服务端数据聚合（`CALENDAR_MONTH` 自然月重置边界时间推导、流量统计图表按小时/天时间桶切片、Agent Gateway 周期边界）全面使用配置时区进行精确日期与时间桶推导。
- **全局基准 URL 主从继承体系与全界面客服支持落地**：
  - 系统设置以 `publicBaseUrl` 作为主基准入口；`subscriptionBaseUrl` 与 `binaryDownloadBaseUrl` 作为可选覆盖项，留空时自适应继承主基准地址。
  - 全界面落地页脚版权与客服支持体系：`footerCopyright`、客服邮箱、Telegram、Discord、自定义客服 URL 在侧边栏底栏（提供「联系客服与帮助」弹窗）、登录页、注册页、个人中心全量对齐渲染。
  - 收敛系统设置中「默认订阅模板」入口：由冗余的修改下拉框调整为只读信息卡片（展示当前默认模板名称与说明）+ 一键跳转至「订阅模板」页管理，消除管理端重复入口。
- **用户管理支持「无订阅」与「无套餐」精准筛选**：
  - 用户管理列表订阅状态筛选下拉新增「无订阅 (NONE)」选项，并在中文化标签中全面对齐（有效 ACTIVE、已取消 CANCELED、已过期 EXPIRED、已吊销 REVOKED、无订阅 NONE）；
  - 套餐筛选下拉新增「无套餐 (NONE)」选项；
  - 服务端 `ListUsersQueryDto` 与 `users.service.ts` 原生支持 `subscriptionStatus=NONE` 及 `planId=NONE`，精准通过 Prisma `where: { subscription: null }` 查询无订阅记录用户。

### Changed

- **管理员创建用户全面切换为纯套餐驱动**：
  - 彻底移除创建用户弹窗中冗余的手动「流量配额」与「到期日期」输入项；
  - 选择「暂不绑定套餐」时创建纯净 0 配额无订阅账号，选择具体套餐时自动由后端继承该套餐预设配额与有效期；如需为个别用户微调，创建后通过「编辑用户 -> 订阅管理」Tab 进行精细化调控。
- **线路端点拓扑与 Landing 体系彻底重构**：
  - 彻底废除历史语义不明且发生抽象泄露的 `exitNodeId` / `exitPort` 字段，全栈全面切换为语义精确的 `Entry`（入口/中转）与 `Landing`（落地）拓扑体系。
  - 数据模型与持久层重塑：直连线路（`DIRECT`）仅持久化入口节点与业务监听端口（`entryNodeId` + `entryPort`），落地字段（`landingNodeId` / `landingPort`）自然保持为 `null`，彻底根除直连模式强行同步伪出口字段导致的幽灵双重端口与大量防御同步代码；桥接线路（`TARGET_LINE`）落地信息完全由目标直连线路动态解析（单一真理源 SSOT）。
  - 节点端口聚合角色三态化：节点详情页与管理表格派生端口角色重构为 `DIRECT`（直连）、`TRANSIT`（中转）与 `LANDING`（落地），直连线路在节点卡片中只展示一次真实业务监听端口。
  - 前端 UI 拓扑向导与展示升级：高级配置中中继模式更名为「落地节点」与「落地监听端口」，直连模式自适应隐藏落地字段；线路管理列表自适应展示节点拓扑（直连单节点、普通中继「中转 ➔ 落地」、桥接中继「中转 ➔ 落地线路」），用户订阅额外授权与节点承载状态自适应对齐。
- 优化用户侧可用线路卡片（`LineCard`）内部排版为双行布局：首行左侧展示线路名称（靠左）、右侧展示纯协议与倍率 Chip（靠右）；次行左侧依次展示在线状态与彩色延迟 Chip（靠左），增强移动端与窄屏容器下的视觉层次与空间利用率。

### Removed

- **彻底下线失效且冗余的全局默认配额与有效天数设置**：
  - 移除已废弃的 `defaultTrafficLimitBytes`（默认流量配额）与 `defaultValidityDays`（默认有效天数）设置字段；新注册用户权益统一由「默认套餐（`defaultPlanId`）」与「注册初始余额（`defaultBalance`）」明确定义，消除了双轨计费与配额配置的语义混乱。

### Fixed

- **无订阅用户禁止重置订阅链接交互与接口防护**：
  - 修复管理用户弹窗中无订阅状态下依然渲染「重置订阅链接」按钮的逻辑漏洞，无订阅时直接隐藏该按钮；
  - 用户管理列表表格操作列对无订阅用户将「重置订阅链接」按钮置灰禁用，并悬浮提示「该用户暂无有效订阅」；
  - 服务端 `UsersService.resetSubscriptionToken` 与 `SubscriptionService.resetToken` 补充订阅存在性校验，无有效订阅请求直接返回 400（`BadRequestException: 该用户未绑定有效订阅，无法重置订阅链接`）。
- **用户订阅管理交互治理与取消订阅数据清理**：
  - 修复无订阅用户打开订阅管理弹窗时回退 100 GiB 配额与到期日的缺陷，默认显示「请选择套餐绑定」并隐藏详细配额/有效期输入项，在未选中具体套餐前禁用「保存订阅」按钮；
  - 已有订阅用户选择「无套餐（彻底取消订阅）」时自适应隐藏配额、已用流量、到期日、增加天数与额外授权输入，展示取消订阅警示说明并将保存按钮切换为高亮危险「彻底取消订阅」操作；
  - 服务端 `adminRemove` 取消订阅时同步在同一事务内将用户镜像流量配额（`trafficLimitBytes`）置 0、已用流量（`trafficUsedBytes`）置 0、到期时间（`expireAt`）置 null，并级联清理该用户的额外线路授权（`userLineGrant`），向边缘节点下发配置同步。
- 修复管理端系统设置页面在移动端与窄屏视口（如 375x812 及 320x568）下的横向溢出与组件适配缺陷：为通用 `SelectTrigger` 补充 `min-w-0`、文本截断（`[&>span]:truncate`）与右侧指示图标防挤压（`shrink-0`）约束；为系统设置各 Tab 卡片、网格容器、时区选择器及表单组件全面增加 `min-w-0`、`max-w-full` 与文本换行折叠防御，彻底根除因长时区选项标签贪婪展开导致的整页横向滚动与右侧边缘截断问题。
- 修复 `scripts/dev-e2e.sh` 在端到端联调启动时因仍使用旧 `exitNodeId`/`exitPort` 过滤与创建直连线路，导致无法复用既有本机线路并触发服务端 `ValidationPipe` 400 校验拦截失败的问题；对齐直连线路单端点入站语义与错误回显。
- 修复开发与联调模式下因 TypeScript 增量编译缓存（`tsconfig.build.tsbuildinfo`）与 Nest CLI 清理输出目录（`deleteOutDir: true`）脱节导致的 `Cannot find module 'dist/main'` 启动崩溃问题；将 server 端增量编译显式关闭并统一产物发射行为，同时在 dev-e2e 启动脚本中增设残留 `tsbuildinfo` 缓存清理。



## [0.6.8] - 2026-09-05

### Added

- **线路测速与延迟 Chip 展示**：实现服务端端到端线路测速功能（以标准 204 站点为探测目标，内核不可用时自动平滑降级为入口 TCP 握手检测），支持后台定时自动轮询与管理端手动一键全量/单行测速；在系统设置中提供定时测速开关、周期、目标 URL 与超时阈值配置；在管理端线路管理表格新增独立「延迟」列，并在管理端及用户侧「我的订阅」可用线路卡片上以绿/橙/红/灰四档彩色 Chip 标签同步呈现实时延迟、测速时间与诊断详情。



## [0.6.7] - 2026-09-05

### Fixed

- 根除中转线路与单节点多线路流量统计失效问题：Sing-box 入站配置层为普通用户注入包含所属线路 ID 的复合标识（`<email_or_uuid>::<lineId>`），通过 Sing-box 原生统计在多入站共存场景下实现精确线路归属；Master Gateway 心跳处理自动拆解复合凭证，按目标线路独立落库 `TrafficLog` 并按自身倍率准确扣除用户套餐配额，彻底废除按节点盲猜线路的抢占缺陷。
- 修复管理端「线路消耗明细」大盘未对齐零流量活跃线路的问题：全量对齐所有已启用的直连和中继线路，无流水线路正常显示 0 B / 0% 占比且按计费量稳定排序，确保所有纳管线路在大盘中全景可见。
- 修复 Docker 构建上下文包含 `artifacts/` 离线镜像产物导致上下文膨胀到数 GB、构建上传缓慢的问题。
- 修复 Docker 构建阶段 pnpm 工作区安装与生产依赖部署使用不同缓存目录、导致每次源码变更重复下载依赖的问题；为 pnpm、Corepack、Go 和 sing-box 下载资源增加 BuildKit 缓存。
- 优化 Docker 镜像导出流程：导出包、校验文件和 manifest 成功生成后默认清理本次导出的本地镜像标签，减少 WSL 中的镜像空间占用；支持通过 `DOCKER_CLEANUP=false` 保留本地镜像。



## [0.6.6] - 2026-09-04

### Fixed

- 修复 Docker Master 镜像因复制 TypeScript 增量构建元数据而静默跳过 Server 编译，导致容器启动时报 `Cannot find module '/app/dist/main.js'`；排除 `*.tsbuildinfo`，并在部署前暂存编译产物、增加镜像构建期入口文件断言。



## [0.6.5] - 2026-09-04

### Fixed

- 修复 Docker 容器与主控自包含发行包因 NestJS 构建产物目录层级漂移导致的 `Cannot find module '/app/dist/main.js'` 启动失败问题：锁定 `tsconfig.build.json` 的 `rootDir` 为 `src` 并排除 `scripts`，并在容器与发行包启动入口增加自适应路径引导。



## [0.6.4] - 2026-09-04

### Added

- 增加订阅分流双端引擎对 `remote-rule-set` 规则配置 `rules` 内联列表的支持，在生成远端提供者的同时生成优先内联 `DOMAIN-SUFFIX`（Sing-box `domain_suffix`），提供零延迟极速冷启动与高可用容灾兜底。

### Fixed

- 修复 Clash 远程规则提供者因默认行为不兼容与缺少本地缓存路径导致的解析失败问题：`rule-providers` 行为默认对齐 `classical`（支持 DOMAIN/DOMAIN-SUFFIX/IP-CIDR 等复合语法）并自动填充 `path: ./ruleset/<name>.yaml`。
- 修复在 Fake-IP 模式下 `GEOIP` 规则因附加 `,no-resolve` 导致域名请求跳过本地解析进而全量击穿为「漏网之鱼」的严重问题。



## [0.6.3] - 2026-09-04

### Added

- 增加订阅分流构建引擎对 `geoip`、`process-name`、`rule-set` 别名解析，以及对 `,no-resolve` 污染目标出站名的自动净化支持。
- 重构生成现代化精细分流模板 (`08_full_template_payload.json`)，覆盖 18+ 细分服务策略并采用 blackmatrix7 双端规则集（Clash YAML + Sing-box SRS 二进制）与 Fake-IP 双流 DNS。

### Fixed

- 修复订阅分流编译引擎中 `type: "geoip"`、`type: "process-name"` 与 `type: "rule-set"` 被错误降级为 `DOMAIN-SUFFIX` 的缺陷。
- 修复因规则目标包含 `,no-resolve` 导致 Sing-box 生成无效 outbound tag 的问题。



## [0.6.2] - 2026-09-04

### Added

- 新增订阅模板现代化工作台：策略组/分流规则可视化卡片与 CodeMirror 源码双模编辑、Clash/Sing-box 实时渲染预览、模板复制与快速预览抽屉。
- 新增模板预览接口 `POST /api/v1/admin/subscription-templates/preview` 与克隆接口 `POST /api/v1/admin/subscription-templates/:id/duplicate`，无真实线路时使用多协议 Mock 节点池。

### Changed

- 订阅编译器升级为语义化 DNS 与 Sing-box 1.8+ Rule-Set 结构，自动生成 Clash `rule-providers`、Sing-box `route.rule_set`，策略组支持标签、协议、倍率复合过滤及故障转移/负载均衡输入。
- 模板默认状态改为事务同步 `SubscriptionTemplate.isDefault` 与 `SystemSetting.defaultTemplateId`；订阅接口增加 `templateId` 调试参数，启动时自动规范化存量模板 JSON。
- 协议代理与异构桥接改用专用内部中继凭证，并在 `config_sync` 的 Stats API 中下发入站 Tag 列表。

### Fixed

- 修复订阅模板 JSON 源码模式缺少语法高亮、编辑区高度固定，以及快速预览未填充抽屉可用高度的问题。
- 修复移动端模板编辑 Sheet 受桌面端最大高度限制导致底部露出遮罩空白的问题。
- 修复模板 YAML 编辑器缺少语法高亮、填充高度编辑器无法纵向滚动，以及深色主题下仍显示浅色编辑区的问题。
- 统一模板编辑器的 YAML/JSON 语言模式、内部滚动边界和明暗主题适配。
- 修复实时预览与快速预览的 Clash YAML 未应用 YAML 语言模式，以及填充型 CodeMirror 滚动边界不稳定的问题。
- 修复编辑订阅模板弹窗中嵌套 Tab 源码编辑器高度链不完整导致长 JSON 无法滚动的问题，使其与快速预览使用一致的可滚动编辑视口。
- 优化模板编辑弹窗的 CodeMirror 滚轮与滚动条行为，建立明确的桌面弹窗高度并将滚动锁定到编辑器自身。
- 修复模板编辑弹窗 Tabs 过度使用零高度约束造成内容下移、截断和布局错位的问题。
- 优化 DNS 高级覆写中的 YAML/JSON 编辑器改为填充面板剩余高度，保留编辑器内部滚动。
- 修复移动端用户流量明细弹窗被桌面端最大高度限制导致底部内容被遮罩截断的问题，并为线路明细表增加横向滚动。
- 修复个人中心账号信息与修改登录密码卡片在移动端窄屏下被长内容撑宽、输入框和复制按钮被裁切的问题。
- 修复盲转发出口流量无法归属中继线路、协议代理首用户被错误扣费、流量倍率未参与配额扣减，以及历史无归属流水无法按盲转出口回退的问题。
- 新增 `apps/server/scripts/clean-traffic-logs.ts`，可幂等回填唯一可确认线路的历史无归属流水。



## [0.6.1] - 2026-09-04

### Changed

- 扩大线路端口自动分配范围，随机上限由 `29999` 调整为端口合法上限 `65535`，前后端及 seed 逻辑保持一致。

- 调整线路高级设置中的 `TARGET_LINE` 选项文案为“协议转换：桥接已有线路”，与其他中继选项统一采用短描述在前、详细描述在后的顺序。

### Fixed

- 修复管理用户弹窗的已用流量及配额字段因固定 `0.1` GiB 步长与字节精度不匹配而无法提交的问题。
- 修复本地主控已运行时 `scripts/dev-e2e.sh` 仍先执行 SQLite 迁移导致 `database is locked`，并统一 Prisma CLI 调用方式。
- 修复主控和 Agent Dockerfile 多行 Node.js manifest 生成脚本被 Docker 解析为独立指令、导致镜像构建失败的问题。
- 修复 Master 重启后 Agent 短暂离线期间刷新订阅会移除线路的问题，并避免旧的离线扫描结果覆盖扫描期间已恢复的节点状态。
- 修复用户流量明细弹窗的外层横向溢出，并扩大桌面弹窗宽度、保持明细表数字字段不换行。



## [0.6.0] - 2026-09-04

### Added

- 新增二进制资源中心 `/admin/binaries`：支持 Agent/Sing-box 资源的本地上传、远程导入、平台资产、SHA-256、状态、默认版本与分发历史管理。
- 新增 `BinaryRelease`、`BinaryAsset`、`BinaryAssetFile`、`BinaryDeploymentTask` 和 `BinaryAuditLog` 持久化模型，升级任务与重试/回滚历史可在 Master 重启后恢复。
- 新增套餐流量重置策略：支持不自动重置、自然月重置和按订阅套餐周期重置。
- 新增管理员用户级额外线路授权，授权线路与套餐线路合并输出并可跨订阅续费、升配和重新购买长期保留。
- 新增 `TARGET_LINE` 中继模式：入口线路可复用其他节点上的直连落地线路，实现异构协议桥接，并保护被引用目标线路免遭删除。

### Changed

- 将 Sing-box 资源版本与 RiriCloud 应用版本解耦；构建、Master bundle、Docker 和 release manifest 分别记录 Agent、Sing-box、`libcronet.so` 的版本与哈希。
- Sing-box Agent 升级改为主文件与 `libcronet.so` 成组下载、校验、原子替换、启动验证和整体回滚；旧 `upgrade_task` 字段继续兼容。
- 订阅流量在读取、心跳入账和后台巡检时按配置周期惰性或定时重置，并在同一事务内同步更新订阅与用户兼容镜像，保留全部流量流水记录。

### Fixed

- 优化资源管理页移动端布局：筛选器与操作按钮自适应堆叠，长 SHA-256 哈希可断行，资源详情与底部操作区避免横向溢出。
- 修复主控启动时旧目录二进制资产认领遇到同版本同目标记录后触发 Prisma 唯一键冲突、导致服务立即退出的问题；改为按复合唯一键幂等处理并保留已有资产。



## [0.5.0] - 2026-09-03

### Added

- 新增协议 v2 的累计流量账务链路：Master 按节点与用户凭证保存 `TrafficCursor`，支持断线重试幂等计费、超大整数累计值和未知凭证基线。

### Changed

- 将 Agent 流量上报从周期增量改为 `QueryStats(reset=false)` 累计快照，WS/HTTP 统一使用 `trafficSnapshots`；该协议变更计划在 v0.5.0 发布，要求 Master 与 Agent 同步升级。
- 优化 SQLite 写入链路：Agent 相关写入进入单写者队列，同节点积压心跳合并为最新值，速率指标按五分钟桶聚合并批量写入，失败任务指数退避重试。

### Fixed

- 修复 Master 重试或心跳中间丢失时可能重复扣减流量、以及 Agent 暂时离线导致累计统计被清零的问题。



## [0.4.22] - 2026-09-03

### Fixed

- 修复 Agent 心跳高频速率清理与流量账务长事务引发 SQLite 写锁争用的问题：心跳按节点串行处理，流量记录批量写入，历史速率改由低频巡检清理。
- 修复订阅到期巡检数据库异常未捕获导致 Master 进程退出的问题，并在启动时初始化 SQLite WAL 与写锁等待参数。



## [0.4.21] - 2026-09-03

### Changed

- 优化套餐市场升配规则：前端禁用低于当前套餐价格的目标套餐，服务端同步拒绝低价升配请求。
- 将个人中心的「VLESS UUID」用户可见文案统一调整为「用户代理凭据」，保留底层协议 UUID 与接口兼容性。
- 移除用户侧独立的「可用线路」页面与导航入口，线路信息统一收敛至「我的订阅」，仅显示线路名称、协议类型、在线状态和倍率。
- 下线用户侧独立「仪表盘」页面，将系统公告、订阅管理、可用线路与客户端使用指引合并至「我的订阅」；登录后访问 `/` 自动替换跳转至 `/subscription`。

### Fixed

- 移除登录与注册页的默认「多节点代理管理面板」副标题：默认留空，已有旧默认值也不再展示，管理员配置自定义副标题后仍可显示。
- 优化登录与注册页输入框提示：移除演示账号和开发测试占位文案，改为面向用户的邮箱与密码填写指引。
- 修复个人中心移动端收支明细表格列宽被压缩的问题：保留完整字段并将横向滚动限制在表格容器内。
- 修复订阅模板内容超过 Express 默认 `100kb` 请求体上限时保存失败的问题：主控与 Nginx 统一支持最大 `2MiB` 请求体，并将超限提示改为中文。
- 修复移动端小型确认弹窗被额外撑宽、按钮纵向铺满的问题：恢复默认 AlertDialog 内容尺寸，并在移动端覆盖为紧凑横向 Footer。
- 优化移动端小型确认弹窗的视觉边界：补充圆角并设置左右安全边距，避免弹窗接近全宽。

### Removed

- 移除前端对 `/api/user/dashboard` 的调用及 `apps/web/src/pages/dashboard` 页面；后端 `GET /api/user/dashboard` 保留并标记为 Deprecated，继续兼容外部脚本。



## [0.4.20] - 2026-09-03

### Added

- 新增用户资产闭环：账户余额与余额流水、注册赠金、充值卡密兑换、管理员批量卡密管理与用户余额调账。
- 新增个人中心 `/profile`，支持卡密充值、收支明细、修改密码和 VLESS UUID 重置；套餐订购、续费与升配统一执行余额扣款。

### Changed

- 套餐价格统一以元作为 API/前端输入输出单位，数据库按分保存并完成存量价格迁移；系统设置新增新用户注册初始余额。

### Fixed

- 修复管理端套餐价格展示不固定两位小数的问题。



## [0.4.19] - 2026-09-03

### Added

- 新增中继模式（Relay）实操与运维指南：在 `docs/DEPLOYMENT_GUIDE.md` 中新增第 5 节《线路编排与中继模式指南》，系统阐述直连与中继拓扑、盲转发与协议代理机制、入口/出口端口及 TCP/UDP 传输层映射规范、云安全组放行策略与多跳拓展方案；并在 `docs/ARCHITECTURE.md` 中完善中继数据流向与独立端口管道架构说明。

### Changed

- 优化 Docker 镜像构建（Dockerfile）：在 runtime 阶段自动将匹配宿主架构的 Agent、Sing-box 定制内核及 libcronet.so 内置进 `/app/binaries/` 静态基线仓，容器即便在挂载空白持久卷时也能开箱对外提供同平台二进制的下载与分发。
- 优化前端管理控制台侧边导航布局（Sidebar）：将「系统设置」项调整至管理后台菜单列表的最底部，使业务实体项（用户、流量、节点、线路、证书、套餐、模板）与全局系统设置层次更加清晰直观。

### Fixed

- 修复 Windows 环境下文件原子替换因瞬态文件句柄占用导致的重命名失败，增加带退避的重试机制。
- 修复主控端订阅生成器策略组代理项解析缺陷：解决 `buildClashYaml` 与 `buildSingboxJson` 粗暴以物理节点列表覆盖所有策略组的问题，完整支持策略组中的显式控制项（`DIRECT`、`REJECT`）保留、策略组跨组层级引用及 `'all'` 动态节点展开，确保全球直连不被错误代理、广告正常拦截且分流联动生效。



## [0.4.18] - 2026-09-03

### Added

- 新增 `scripts/build-binaries.sh`：自动化编译 Agent 5 平台架构与 Sing-box Linux 双架构定制内核（含 V2Ray API、uTLS、QUIC、NaiveProxy purego 与 libcronet.so），统一输出到 `artifacts/binaries/`。
- 新增 `scripts/bundle-master.sh`：独立装配指定宿主架构的主控端生产发行包，精准注入匹配架构的内置 Agent 与 Sing-box，彻底剔除无关平台的二进制冗余。
- `scripts/release.sh` 升级支持 `--dry-run` 完整构建演练与 `--skip-build` 快速发布重试模式。

### Changed

- 彻底收敛重构服务端二进制纳管体系（`BinariesService`）：废除 9 目录模糊搜索，建立 `data/binaries/`（持久仓）与 `binaries/`（内置仓）双层规范存储，非生产环境自动回退至本地开发产物，并新增启动看板日志输出。
- 统一收敛全局构建产物目录拓扑至 `artifacts/`（`binaries/`、`master/`、`packages/`、`docker/`），清理遗留嵌套与冗余规则。



## [0.4.17] - 2026-09-03

### Changed

- 优化线路 TLS 配置：ALPN 改为按协议与传输层提供预设多选，兼容保留历史非标准值，Reality 不再展示无效的 ALPN 字段。

### Fixed

- 修复节点 Agent 安装命令固定生成 `<master-domain>`、二进制下载 302 在生产部署中错误回退到 localhost 的问题；新增全站访问 URL 设置，并支持从反向代理请求头自动匹配当前域名。
- 修复订阅生成未统一使用线路视图的问题；现在启用对外端点覆盖后，Base64 URI、Clash Meta 和 Sing-box 配置都会使用覆盖后的服务器地址与端口。



## [0.4.16] - 2026-09-02

### Added

- 新增 Nginx 反向代理与订阅伪静态支持：提供严格 UUID rewrite、普通 Master 代理、`/ws/agent` WebSocket Upgrade 配置示例；后端继续只维护 `/api/v1/sub/:token` 标准订阅接口。
- 新增共享业务复合组件 `LineCard`（`apps/web/src/components/shared/line-card.tsx`），统一封装线路展示，支持 `compact` 紧凑概览与 `full` 完整拓扑双变体。
- 新增管理员流量统计 `/admin/traffic` 与用户流量明细下钻，支持多周期时序聚合、线路倍率计费、线路排行、配额画像和响应式图表展示。
- 新增节点实时上下行速率与全站历史速率统计：Agent 拆分网卡上/下行差分，Master 按 5 分钟聚合保留 30 天，管理端统一使用“流量统计”展示节点网络吞吐。

### Changed

- 系统设置新增默认关闭的 `subscriptionShortLinksEnabled`，公开系统信息和管理员设置页同步暴露；用户仪表盘与「我的订阅」统一按配置生成标准或 Nginx 伪静态订阅地址，并明确提示需同步配置 Nginx。
- 优化用户控制台各页面信息架构与语义分工：仪表盘聚焦全局指标与快捷指引，我的订阅聚焦套餐画像与全生命周期管理，可用线路提供完整节点拓扑与健康看板。
- 全站统一流量字节格式化函数 `formatBytes`（收归至 `@/lib/utils.ts`），智能消除多余末尾 0 并统一通用单位标准（B / KB / MB / GB / TB）。
- 完善仪表盘、我的订阅和可用线路在无有效订阅时的统一 `EmptyState` 空状态与套餐市场跳转引导。

### Fixed

- 修复流量统计大盘与用户流量明细弹窗在切换时间颗粒度（今日/24h/7d/30d）时，因 React Query 参数变化导致整页 DOM 卸载与骨架屏闪烁的问题，引入 `keepPreviousData` 与微透明过渡实现数据平滑补间。
- 修复流量统计服务测试使用固定东八区时间导致 GitHub Actions UTC 环境跨日失败的问题。
- 修复「我的订阅」页面存在两个功能重复的“复制链接”按钮的问题，统一保留输入框右侧内联的标准 `CopyButton` 动态反馈组件。
- 修复桌面端主内容区 Inset 浮雕卡片因多余的 `w-full` 导致右侧外边距失效溢出、紧贴浏览器右边缘的问题，并优化间距与顶栏对齐（`md:mr-4 md:mb-4`）。


## [0.4.15] - 2026-09-02

### Added

- 新增主控端 TLS 证书管理中心，支持 PEM 证书/私钥解析、公私钥匹配校验、SAN 与有效期展示、线路关联及内嵌证书下发。

### Changed

- Docker Compose 数据持久化改为宿主机路径绑定，支持通过 `MASTER_DATA_PATH` 与 `AGENT_DATA_PATH` 自定义 Master 和远程 Agent 数据目录。
- 整理 Docker 镜像构建/导出与 Agent 二进制编译入口：发布脚本复用统一的 Agent 编译参数，新增目标平台、全平台矩阵和发布模式选项。
- Docker 构建、导出与 Compose 操作明确限制在 Linux/WSL shell，并校验 Docker daemon 使用 Linux containers；`docker:tags` 可脱离 Docker daemon 查询标签。
- 升级主控面板布局为 shadcn/ui 官方 Inset 沉浸式卡片架构（`variant="inset"`），移除全屏贯穿 1px 硬分割线，建立明暗双模式三层阶梯景深系统（L0 底层画框 / L1 主画布卡片 / L2 内容卡片）。
- 顶部配置独立小巧的微操作栏（`h-14`，与侧栏 Logo 水平齐平，内置 `ThemeToggle` 与 `UserMenu` 圆形头像菜单），主工作区下沉为带圆角与外边距的浮雕大卡片。
- 优化系统设置「安全与高级」中的 JWT 安全提示布局，改用 shadcn/ui 原生 `FormDescription` 辅助字段样式，减少空白与嵌套卡片层级。
- 将 Agent 运维页的默认探针目标从 JSON 文本框改为基于 shadcn/ui 原生表单控件的二级 Dialog 编辑，使用本地草稿支持按类型配置地址、端口、超时并增删目标，点击“应用”后回填设置表单。
- 完成全站移动端适配：移动 Sidebar 改为可关闭 Sheet 抽屉，复杂编辑弹窗在手机端切换为全高 Sheet，表格与筛选工具栏支持局部横向滚动和多行布局。
- 优化移动端列表表格 Badge 展示，保持套餐、角色、状态等 chip 单行横向扩展，避免窄列压缩成竖排。

### Fixed

- 修复证书管理弹窗在新建状态下保存按钮误禁用及长文本区域在窄屏下的水平溢出问题。
- 修复系统设置「安全与高级」中的自定义 CSS 和 HTML/JavaScript 编辑框未跟随深色模式切换、仍显示白色编辑区的问题。
- 修复主控容器和自包含发行包启动内置 Agent 时继承终端并误进入 Bubble Tea TUI，导致 `cancelreader` epoll 初始化失败、主控容器反复重启的问题。


## [0.4.14] - 2026-09-01

### Added

- 生产环境启动时自动创建内嵌默认订阅模板，不再依赖 `AUTO_SEED=true`。

### Changed

- 内嵌默认模板增加 `isBuiltin` 标记，允许管理员编辑配置但始终禁止删除。

### Fixed

- 修复生产部署在关闭完整演示 seed 时缺少可用默认订阅模板的问题。


## [0.4.13] - 2026-09-01

### Added

- 内嵌新的「默认通用全能分流模板」，包含地区节点、AI、流媒体、Telegram、广告拦截、国内直连、DNS/Fake-IP 和客户端覆写配置。

### Changed



### Fixed



## [0.4.12] - 2026-09-01

### Added



### Changed



### Fixed

- 修复系统设置五分类 Tab 的 Lucide 图标未限制尺寸，导致图标明显大于标签文字的问题。

## [0.4.11] - 2026-09-01

### Added

- 开发联调启动的 Web 面板支持跟随主控自动选择的端口。

### Changed



### Fixed

- 修复 Windows 系统排除主控默认端口时，Web 面板仍将 `/api` 请求代理到 `3000`，导致页面持续提示请求失败的问题。

## [0.4.10] - 2026-09-01

### Added

- `scripts/dev-e2e.sh` 自动探测主控可用端口，兼容 Windows 系统排除端口范围。

### Changed

- 开发联调支持通过 `SERVER_PORT` 或 `PORT` 固定主控端口，并将自动选择的端口同步到 `SERVER_URL`。

### Fixed

- 修复 Windows 本地 TCP `3000` 被系统排除时，开发 E2E 在 Nest 主控启动阶段因 `EACCES` 直接失败的问题。
- 修复主控端自动切换端口后 Agent 仍连接写死的 `3000` WebSocket 地址，确保 Agent 跟随最终主控端口联调。
- 修复 Windows 系统排除 StatsService 默认端口 `10085` 时 Sing-box 启动后立即退出的问题，开发联调现在会自动选择可用 StatsService 端口。
- 修复 Git Bash 后台运行 Agent 时误进入 Bubble Tea TUI 导致 `cancelreader` console handle 无效的问题。

## [0.4.9] - 2026-09-01

### Added

- `scripts/dev-e2e.sh` 在默认 Sing-box 缺少联调构建标签时，自动从源码构建并缓存带 `with_v2ray_api` 等必需标签的本机内核。

### Changed

- 开发联调未设置 `JWT_SECRET` 时自动生成本次进程使用的随机密钥，并在主控启动失败时立即输出最近日志。

### Fixed

- 修复 Windows 开发环境使用官方预编译 Sing-box 导致 E2E 在流量统计能力检查阶段直接退出的问题。

## [0.4.8] - 2026-09-01

### Added

- **系统设置全参数可配置化**：新增基础品牌、注册策略、订阅分发、Agent 运维和安全个性化五大类系统设置，支持强类型校验、默认值回退、部分更新与恢复默认值。
- **现代化系统设置管理面板**：新增五 Tab 设置界面、CodeMirror CSS/HTML 编辑器、模板与套餐选择、当前面板地址快捷填充和重置确认流程。
- **动态站点品牌与用户端联动**：支持运行时更新站点标题、Favicon、Logo、自定义 CSS、HTML/JS 注入、Markdown 公告、客服入口及无订阅引导。

### Changed

- **认证、订阅与 Agent 运维配置化**：注册密码和邮箱域名策略、默认套餐、订阅更新周期、默认模板、用量响应头、线路公开开关、Agent 心跳/同步参数和二进制下载地址均改为读取系统设置。
- **订阅与公开系统信息接口**：扩展管理员设置 API 与公开站点信息接口，并同步完善相关数据模型、协议和前端规范文档。

### Fixed

- **兼容旧数据库设置**：缺失或格式异常的系统设置会安全回退至内置默认值，避免升级后配置读取失败。

## [0.4.7] - 2026-09-01

### Added

- **README 徽标自动同步与三向一致性校验**：版本管理工具（`pnpm bump`）在递增版本时自动同步更新根目录 `README.md` 顶部的 Version 徽标；`pnpm gate:version` 门禁新增对 `README.md` 徽标的强一致性机械校验，确保 `package.json`、`CHANGELOG.md` 与 `README.md` 徽标三位一体零偏差。

### Changed

- 完善版本管理规范（`docs/VERSIONING.md`）与代码审查门禁清单（`docs/CODE_REVIEW.md`）。

## [0.4.6] - 2026-09-01

### Added

- **代码-文档联动机械门禁**：在 `scripts/doc-governance.mjs`（`pnpm gate:docs`）中集成 Git Diff 变更路径与文档关联检测，严格杜绝修改 Prisma 模型、API 控制器、部署脚本、依赖项或 UI 页面却遗漏同步文档的情况。
- **显式文档豁免标记**：支持在 commit message 或 PR 描述中使用 `[skip-doc-sync]` 或 `docs-exempt` 显式声明纯内部逻辑重构，避免误报阻断。

### Changed

- 规范文档（`docs/CODE_REVIEW.md`、`docs/PROJECT_CONSTRAINTS.md`、`AGENTS.md`）同步完善联动规则映射表与门禁说明。

## [0.4.5] - 2026-09-01

### Added

- Agent TUI 顶部信息栏恢复语义化版本显示，例如 `Edge Agent  ·  v0.4.5`。

### Changed

- 本地 Agent 构建和门禁默认从根 `package.json` 注入版本号，不再把正式构建显示为 `dev`。

### Fixed

- 统一处理带 `v` 和不带 `v` 的版本输入，避免顶部版本号重复前缀。

## [0.4.4] - 2026-09-01

### Added

- 新增根级 `pnpm build` 与 `pnpm build:agent`，统一输出 Agent 本地构建产物。

### Changed

- 统一二进制产物目录：本地 Agent 使用 `artifacts/dev/agent/`，Docker 导出物使用 `artifacts/docker/`，Release 使用 `artifacts/releases/`。
- 保留 `apps/server/dist/` 与 `apps/web/dist/` 作为框架运行时约定目录，避免破坏静态资源托管和容器构建。

### Fixed

- 修正构建、联调、门禁和发布脚本中的旧产物路径，并同步离线部署文档与仓库忽略规则。

## [0.4.3] - 2026-09-01

### Added

- 暂无新增条目。

### Changed

- 精简 Agent TUI 首页层级，移除重复的控制台标题和操作说明文案。

### Fixed

- 优化首页首屏信息密度，保留底部快捷键提示和核心菜单内容。

## [0.4.2] - 2026-09-01

### Added

- Agent 无参数启动改为 Bubble Tea 全屏控制台 GUI/TUI，支持 raw-mode 方向键即时导航、Enter 执行和 Esc 返回。
- Agent TUI 新增安装配置表单、卸载二次确认、异步操作状态页与长输出滚动查看。

### Changed

- TUI 操作输出改为内存捕获后在结果页展示，保留 `install`、`status`、`doctor`、`logs` 等非交互命令供脚本使用。

### Fixed

- 修复旧按行输入菜单无法可靠解析终端方向键转义序列的问题。

## [0.4.1] - 2026-09-01

### Added

- Agent 内置 Cobra 一级命令、lipgloss 交互式 TUI、Doctor 诊断和彩色日志查看器；支持 `install`、`uninstall`、`start`、`stop`、`restart`、`status`、`logs`、`run` 与 `version`。
- Agent 使用 `/etc/riri-agent/config.yaml` 与 `/var/lib/riri-agent/` 标准目录，支持从 Master 获取 Sing-box、GitHub 回退、原子配置写入和跨平台服务注册。
- 主控新增 `GET /api/v1/downloads/agent`，按 `riri-agent-installer/<os>-<arch>` User-Agent 选择 Agent 二进制并返回受 AgentToken 保护的 302。

### Changed

- 节点详情安装命令改为原生 CLI 引导，面板同时展示 WS、HTTP 和 `uninstall --purge` 命令；发布流程新增 macOS Agent 产物。

### Fixed

- 移除旧 `scripts/install-agent.sh`、`GET /api/v1/install.sh` 及 Docker/主控发行包中的脚本复制逻辑，避免安装行为与 Agent 实现分叉。

## [0.4.0] - 2026-09-01

### Fixed

- 修复 SS2022 多用户订阅、Sing-box 出站和协议代理中继只携带用户密钥的问题；客户端凭证现在按协议组合为 `server_password:user_password`，可正确完成认证并保留用户归属统计。

### Changed

- 完善 Master 管理员初始化：新增 `ADMIN_EMAIL`/`ADMIN_PASSWORD` 与兼容旧配置的首个管理员 bootstrap；生产默认 `AUTO_SEED=false`，演示 seed 与管理员初始化分离。
- 新增 `pnpm admin:reset`、发行包 `./admin-reset.sh` 和 Docker 容器内管理员密码重置命令，默认隐藏交互输入并支持 `--password-stdin`；重置不会创建或提权账号。
- 加强 `JWT_SECRET` 校验，拒绝空值、模板占位值和少于 32 位的密钥；同步 Compose、发行包配置模板、启动脚本与部署文档。
- 新增节点一键安装脚本与 `GET /api/v1/install.sh` 公开分发端点：按 VPS 架构下载 Agent/Sing-box，写入受限权限配置并注册 systemd 服务。
- 新增主控与 Agent 的多阶段 Docker 镜像、Compose 编排及 `pnpm docker:build/up/down` 快捷命令；主控容器自动迁移并支持 `AUTO_SEED` 幂等播种，SQLite 使用持久化卷。
- 优化 Docker 镜像交付：统一生成版本号与 `latest` 双标签，补充 OCI 版本/提交/构建时间元数据；`pnpm docker:build` 默认将规范命名的镜像包、manifest 和 SHA-256 校验文件导出到仓库 `docker-images/`，并新增 `pnpm docker:export` 与 `pnpm docker:tags`；Master/Agent 运行时切换为 Distroless，Master 在构建阶段生成 Prisma Client 并清理无用 Prisma 运行时文件。
- 新增 `docker-compose.image.yml` 与 `.env.image.example`，支持加载导出的 Master/Agent 镜像后离线部署；模板禁止自动构建和拉取，并复用标准 Compose 的持久化数据卷。
- 主控自包含发行包现在同时携带 `install-agent.sh` 与 `admin-reset.sh`；启动脚本默认仅迁移并初始化管理员，明确设置 `AUTO_SEED=true` 才执行幂等演示 seed。
- Master 镜像与自包含发行包内置 Linux Agent 和 Sing-box；启动时自动创建或复用不可删除的 `Master-Local` 节点并让内置 Agent 连接本机网关。`AUTO_SEED=false` 仍不创建演示业务数据，远程 Agent 继续支持独立镜像和安装脚本部署。
- 节点详情页升级为完整运维控制台：新增 Agent 重启、安装命令、主控内置升级中心、探针预设与结果回显，并展示 Agent/系统架构/内核版本画像、网络质量快照和格式化错误日志。
- 主控新增自包含二进制分发中心：发行包携带多架构 Agent，按节点架构自动装配内部下载 URL 与 SHA-256；自定义 Sing-box 文件可经管理员导入并托管，节点无需直连 GitHub。
- Agent 心跳与 HTTP 轮询新增版本画像；探针结果增加 DNS 地址和丢包率，WS/HTTP 两种模式统一持久化最近一次诊断快照。
- 新增 Agent WS/WSS 与 HTTP/HTTPS 双通信模式：节点可按 URL 协议或 `AGENT_MODE` 选择通信引擎，HTTP 轮询支持配置差异、异步探针/升级任务与动态轮询周期；管理端展示通信状态和最近上报时间，并提供双模式安装命令。
- 线路顶层编排重构（v0.4.0）：Line 成为唯一面向用户的代理业务端点，直接内聚 `protocolType`、`paramsJson`、入口/出口节点与端口、SNI/Host 覆盖、倍率、标签、等级和启停状态；Node 仅保留底座机器、Agent 与内核遥测状态。
- 套餐匹配与用户订阅详情改为线路语义，新增管理员线路管理页、直连/中继动态表单、线路排序/批量启停/复制/解析测试，以及用户可用线路视图。
- 中继配置下发：支持 `BLIND_FORWARD` 盲转发和 `PROTOCOL_PROXY` 协议代理，线路变更复用 250ms 防抖自动推送在线 Agent；seed 新增 `Master-Local` 与演示线路。
- 线路对外覆盖新增默认关闭的 `endpointOverrideEnabled` 开关：关闭时复用入口节点的地址/端口和 Line 参数中的 SNI/Host，保留已填写的覆盖值供重新启用。
- 改进本地一键联调脚本：主控进程异常退出时立即显示最近 40 行服务端日志，避免启动失败时长时间无反馈。
- 统一线路端口生命周期：入口/出口端口未指定时由服务端随机分配 `20000~29999` 的五位端口，同节点同 TCP/UDP 传输层独占；编辑既有线路时保持原端口不变。
- 线路向导支持 VLESS/Reality 密钥生成、直连/盲转发/协议代理拓扑与只读端点预览；节点页移除手动添加入站入口，改为线路承载与派生端口视图。
- 恢复线路管理完整可视化编辑：线路编辑弹窗拆分为“入站配置”和“线路高级设置”两个页签，重新提供全协议、Transport、TLS/Reality/ACME 与协议专属参数控件，并支持线路 Tag/监听地址配置。
- 线路编辑弹窗布局扁平化：移除 Accordion 折叠和表单内部嵌套卡片，改用分区标题与分隔线展示完整配置。
- 优化线路编辑流程：将必选的入口节点选择移至“入站配置”页签，高级页仅保留出口拓扑与线路级设置。
- 统一管理端弹窗尺寸：普通表单使用适中的统一宽度，线路和模板编辑保留更宽的编辑空间，移动端统一留白并支持内容滚动。
- 统一 sing-box 协议配置：修复 VMess 入站 `alterId`、ShadowTLS v3 + SS2022 内层双入站、SS2022 固定长度密钥、Reality 客户端 TLS、WebSocket `headers.Host` 与协议代理中继出站字段；ShadowTLS v2/独立密码结构不再兼容；TUIC 0-RTT 默认关闭。
- 补齐 Docker 与发行包内置 Sing-box 的 `with_quic` 和 `with_naive_outbound` 构建标签，确保 Hysteria2/TUIC 线路可以实际启动、NaiveProxy 订阅出站可用。

- 深色主题色阶调优：消除 OLED 极黑刺眼眩光，升级为柔和深炭灰（`#141417`）与立体卡片（`#1c1c20`），降低纯白文字对比度至温润浅灰白（`#e4e4e7`），显著提升暗光环境下的阅读舒适度。
- 富文本编辑器深色模式自适应：为高级配置中的 CodeMirror JSON 编辑器绑定 `resolvedTheme` 主题适配，实现全站明暗模式与暗色代码高亮无缝联动。
- 选项卡平滑淡入动效：在 `TabsContent` 原子组件中注入 `data-[state=active]:animate-in`，使全局选项卡切换具备 200ms 丝滑过渡；详情页加载态升级为结构化骨架屏（Skeleton）。
- 前端侧边栏结构化分组：将侧边导航划分为「控制台（仪表盘）」与「管理后台（用户管理 / 节点管理 / 系统设置）」层级，提升层级认知清晰度。
- 用户仪表盘安全与客户端指引增强：普通用户主页剥离底层 VPS 机器与端口暴露表格，聚焦个人配额、到期时间、可用线路统计指标与「我的订阅」；新增 3 步客户端快速导入与连接指引。
- 节点详情管理与安全防护强化：明确「节点（宿主 VPS）- 入站（协议端口）- 线路（订阅代理项）」分层体系；详情页划分为「入站协议」、「基础与遥测」与「高级与运维」三大功能区；配置重载操作增加二次确认弹窗，删除节点操作收归高级选项卡底部危险操作区（Danger Zone）并增强拦截警示。
- 管理端订阅管控融合至用户管理：侧边栏收敛为 5 项，用户列表聚合套餐/订阅状态/流量/到期日并支持多维筛选；创建用户支持可选初始套餐或无套餐创建，编辑用户通过「账号安全 / 订阅管理」双 Tab 一站式管理，选择“无套餐”可彻底移除订阅；旧 `/admin/subscriptions` 页面重定向至用户管理，后端接口保持兼容。

### Fixed

- 修复流量监控链路失效：Agent 通过启用 V2Ray API 的 Sing-box 读取按用户周期增量，Master 按订阅实体事务扣减并同步 User 兼容镜像，仪表盘、订阅页和管理员用户列表每 5 秒自动刷新。
- 修复 Distroless Docker 镜像中 seed 命令和 Compose healthcheck 仍依赖 PATH 中 `node` 命令的问题；现在统一使用镜像内 Node 可执行文件路径，保留自动迁移、seed 和健康检查能力。
- 修复本机 VLESS/Reality 线路错误组合 `xtls-rprx-vision` + 明文 TLS 配置导致客户端握手超时；服务端现在会自动清除明文 VLESS 的 flow，seed 默认生成有效 Reality 配置，并迁移修复存量记录。
- 节点删除保护：主控本机 `Master-Local` 节点不再允许删除，管理端隐藏对应删除入口，服务端接口统一返回 `409`。
- 修复线路响应兼容摘要缺少出口节点信息导致旧页面读取失败；本地联调脚本默认复用 seed 预置的 `Master-Local`，避免 Agent 连接到临时节点后面板本机节点仍显示离线。
- 修复本地联调脚本仍调用已移除的节点入站 API 导致创建入站返回 404；现在通过线路 API 复用或创建 VLESS Reality 直连线路。
- 修复 seed 盲转发示例线路与本机直连线路复用同一 VLESS 端口导致 sing-box bind 失败；重复 seed 会自动修复冲突端口，服务端也拒绝创建同节点同端口的中继线路。
- 修复内核主动重启被误报为配置应用失败：配置变更触发的重启在 Windows 下经 Kill 退出码非 0，旧逻辑把被杀内核的最后 8KB 正常运行日志记为 `configError` 随心跳上报。主动停止（重启/Shutdown）现标记为预期退出——不记错误、不计退避；内核拉起成功即清除历史失败原因（崩溃自愈后面板不再显示陈旧错误）。
- 修复 Sing-box 升级窗口的 supervisor 竞态：停止旧内核后不再提前拉起旧二进制；新版本启动失败时恢复旧二进制并重新收敛内核。
- 修复同节点快速重连时旧 WebSocket 的 `close` 事件误把新连接标记为离线；Agent 自更新重启现在保留原始命令行参数。
- 修复本地联调脚本仅在数据库文件不存在时执行迁移，导致已有旧 `dev.db` 缺少新增字段并在节点接口返回 `500`；现在每次启动前检查并应用待迁移版本，早期失败也会清理本次启动的服务进程。
- 修复套餐未显式绑定模板时未使用全局默认模板，以及套餐 `isPublic=false` 查询参数在转换后可能被误判为 true 的问题。
- 修复用户管理弹窗开关卡片与相邻输入控件的视觉层级不一致：统一卡片高度并补齐 `shadow-sm` 外层阴影。

### Added

- 统一版本管理与自动化门禁治理体系：
  - 规范化 PR 级连续版本递增机制：严格约束每个包含核心代码修改的 PR 在合入 main 前必须递增版本号，并在 CHANGELOG.md 中同步完成版本小节维护；纯文档、脚本或配置变更允许免增版本。
  - 落地零依赖版本治理工具链 `scripts/version-governance.mjs`：提供 `pnpm bump [patch|minor|major]`（一键递增 `package.json` 版本号并同步在 CHANGELOG.md 顶部建立版本小节）与 `pnpm gate:version`（校验 SemVer 合法性、单仓唯一版本源、CHANGELOG 格式与 Git 分支代码变更递增约束）。
  - 建立三重质量防线：在本地全局门禁 `pnpm gate`、GitHub Actions CI 流水线（`.github/workflows/ci.yml`）与 Git 钩子（`.husky/pre-push`）中全链路接入版本约束拦截，并在 `AGENTS.md`、`docs/VERSIONING.md`、`docs/GIT_WORKFLOW.md` 与 `docs/PROJECT_CONSTRAINTS.md` 中固化执行 SOP。
- 文档治理与规划归档机械约束体系：
  - 规范化规划与归档目录分层：新增 `docs/plans/`（进行中规划台账）与 `docs/plans/archive/`（历史归档），制定标准 YAML Frontmatter 元数据与 `YYYY-MM-DD-*.md` 归档命名规范。
  - 落地零依赖治理工具链 `scripts/doc-governance.mjs`：提供 `pnpm gate:docs`（根目录白名单、Frontmatter 校验、100% 完成阻断、归档规范检查）、`pnpm plan:archive`（一键完成打标、重命名与归档）、`pnpm plan:new`（一键生成标准模板）与 `pnpm plan:sync`（台账自动同步）。
  - 将原 `docs/TODO.md` 正式迁移归档至 `docs/plans/archive/2026-08-31-v0.3.0-architecture-refactor.md`，并在 `docs/plans/README.md` 中建立总台账。
  - 全局门禁 `pnpm gate` 接入 `gate:docs`，并在 `AGENTS.md`、`docs/README.md` 与 `docs/PROJECT_CONSTRAINTS.md` 中固化机械约束规则。
- 套餐、唯一用户订阅与订阅模板完整闭环：新增套餐 CRUD/公开市场、节点标签与等级匹配、订购/升配/取消/过期巡检、管理员管控、Token 重置，以及 Clash Meta/Sing-box 模板策略组、规则集、DNS 和顶层覆写。
- Agent 远程运维通道：新增 Sing-box/Agent 安全升级任务与 TCP/DNS/ICMP 网络探针，支持流式下载、SHA-256 校验、原子替换、启动失败回滚和升级结果回执。
- Master-Agent 上行消息运行时校验与网关回归测试，拒绝未知或结构不合法的心跳、配置回执、升级回执和探针回执。
- 开源协议与公开仓库配置：项目采用 [GNU General Public License v3.0 (GPL-3.0)](./LICENSE) 协议开源，更新根 package.json 与 README.md 协议元数据。
- 工程治理加固与 main 分支绝对保护：在 `.husky/pre-commit` 与 `.husky/pre-push` 中加入分支检测拦截脚本，物理阻断在 `main` / `master` 分支上的直接提交与直接推送；在 `AGENTS.md`、`docs/GIT_WORKFLOW.md` 与 `docs/PROJECT_CONSTRAINTS.md` 中强化零容忍红线与标准 6 步 Git SOP，杜绝绕过 PR 直接改动主干。
- 前端 UI 视觉验证规范与全量索引台账：建立基于 Antigravity 代理环境的规范化 UI 视觉走查流程与台账（`docs/VISUAL_VERIFICATION.md`），覆盖 7 大核心页面、5 类模态交互与双主题状态；建立 Git Diff 代码变更映射规则，实现按需精准/全量走查与标准化 Markdown 验证报告输出；同步更新 `AGENTS.md` 与 `docs/FRONTEND_UI_GUIDELINES.md`。
- 节点入站可视化全协议与解耦支持：根据 Sing-box 官方规范将入站管理全面升级为【协议 + 传输层 (TCP/WS/gRPC/HTTPUpgrade) + 安全层 (关闭/标准TLS/Reality/ACME)】模块化解耦架构。
  - 支持全协议入站：VLESS、VMess、Trojan、Hysteria 2、TUIC v5、Shadowsocks (含 SS2022 与多用户模式)、NaiveProxy、ShadowTLS、Mixed (SOCKS5/HTTP)、SOCKS5、HTTP、Direct。
  - 前端入站弹窗动态联动：按【基础与网络】、【传输层 (Transport)】、【安全与加密 (TLS / Reality / ACME)】、【协议专属高级参数】分模块呈现，并提供 Reality 密钥一键生成与参数实时校验。
  - 订阅生成器全协议适配：通用 URI、Clash Meta YAML 与 Sing-box Client JSON 完整导出所有主流代理协议，并按协议规范智能映射用户凭证（UUID / 用户密码 / SS 多用户密码）。
  - 服务端入站参数深度合并与脱敏保障：入站更新时支持嵌套 TLS/Reality/Transport 参数深度合并，确保脱敏响应回传时不丢失服务端私钥与敏感配置。
- 移动端与全响应式布局：全面接入 shadcn/ui 官方全新 `Sidebar` 体系，支持移动端（`< 768px`）汉堡按钮拉出左侧 `Sheet` 导航抽屉，桌面端支持 `Ctrl+B` 快捷键与图标模式（Rail）折叠切换；登录/注册页修复为 SPA 客户端 `<Link>` 路由，消除白屏硬刷新与闪屏；新增禁止清单 `B7` 与架构约束 `W10`。
- 全局 UI 微交互规范与样式优化：全站引入自适应主题的细窄圆角滚动条规范（消除 Windows 默认粗灰轨道与上下箭头），并全局隐藏数字输入框（`type="number"`）的原生微调箭头；规范与硬约束已固化至 `docs/FRONTEND_UI_GUIDELINES.md` 与 `docs/CODE_REVIEW.md`。
- 节点列表页增强：入站协议 badges（悬停显示 tag 与监听地址）、内核运行状态列、节点名点击进入详情；创建弹窗轻量化（只收名称/地址/订阅公开，成功后可一键「前往配置入站」）。
- 前端基础设施：新增 `@uiw/react-codemirror` + `@codemirror/lang-json`（TECH_STACK 登记，详情页懒加载分包）与 shadcn 组件 textarea/tabs/separator/accordion；用户仪表盘节点列表适配入站结构（协议 badges 来自公开入站）。

- Sing-box 配置预检与回滚（Agent）：`config_sync` 落盘后、拉起前执行 `sing-box check -c` 预检（15s 超时）；失败则拒绝该配置、磁盘回滚 lastGood、在跑内核不受影响；内核 stderr 环形采样尾部 8KB，异常退出原因随心跳上报。
- 内核状态回报（Agent → Master，向后兼容）：心跳新增可选字段 `kernelRunning`/`appliedConfigVersion`/`lastError`；新增 `config_apply_result{version,success,message}` 回执。Master 新增 `Node.kernelRunning`/`Node.configError` 列（旧版 Agent 不上报时保持原值），配置应用失败原因在管理端可见。

- 节点多入站多协议数据模型（BREAKING）：新建 `NodeInbound` 关系表（`type/tag/listen/port/paramsJson/sortOrder/isPublic`，`@@unique([nodeId,tag])`），一个节点可挂多条入站，支持 VLESS_REALITY / HYSTERIA2 / SHADOWSOCKS / TUIC 四协议；`Node` 删除 `serverPort`/`protocol`/`configPayload`、新增 `configOverride`（高级模式完整 sing-box 配置顶层覆盖 JSON）。迁移脚本把存量节点自动转为一条 VLESS_REALITY 入站（tag 统一 `vless-in`，端口与 Reality 参数原样迁入）。入站参数结构见 `docs/DATA_MODELS.md` §3.1。
- 入站管理 REST API：`GET /admin/nodes/:id` 节点详情、`POST|PATCH|DELETE /admin/nodes/:id/inbounds[/:inboundId]`（嵌套 DTO；tag 缺省按协议前缀生成、冲突自动追加序号，显式冲突 409；同传输层端口冲突 409，QUIC 系 UDP 协议可与 TCP 协议同端口共存；params 与现有值浅合并后重新归一化，脱敏不丢私钥）、`POST /admin/nodes/reality-keypair` 生成 X25519 密钥对（不落库）；入站每次变更后在线节点自动热推送。
- `POST /admin/nodes` 简化为只收基础信息 `{ name?, serverHost, isPublic? }`（入站独立管理）；`PATCH /admin/nodes/:id` 新增 `configOverride`（合法 JSON 对象校验，`null` 清除）与 `sortOrder`。
- 多协议订阅输出（BREAKING）：订阅引擎按公开入站逐条生成，四协议 × 三格式（Base64 URI（vless/hy2/ss(SIP002)/tuic）、Clash Meta YAML（vless/hysteria2/ss/tuic proxy）、Sing-box Client JSON）；输出名单入站节点用节点名、多入站节点为「节点名·tag」并全局去重；hy2/tuic 密码取 `User.password ?? uuid`（`User.password` 字段自此启用）。
- 用户侧节点列表 `GET /user/nodes` 协议/端口视图改由公开入站提供（`inbounds[{type,tag,port}]` 摘要）。

### Changed

- 主题切换升级为三态：顶栏按钮改为下拉菜单（浅色 / 深色 / 跟随系统），默认跟随操作系统深色模式，手动切换后可随时恢复「跟随系统」；顶栏图标随所选模式显示（太阳 / 月亮 / 显示器），不再混淆「跟随系统」与手动明暗；规范同步更新至 `docs/FRONTEND_UI_GUIDELINES.md`。
- `config_sync` 组装重构：按节点入站数组逐条组装四协议服务端入站（Reality 参数不再硬编码，密钥/SNI/dest/shortIds 可编辑）；有资格用户按协议注入（vless/tuic 用 uuid，hy2 密码取 `User.password ?? uuid`，ss 共享密码不注入）；`configOverride` 顶层深合并（嵌套对象按键合并、数组整体替换，含 `inbounds` 则整组替换）。协议组装收拢 `apps/server/src/common/inbound.ts` 单一实现。
- **BREAKING**：Node 相关 API 响应结构变化（`serverPort`/`protocol`/`configPayload` 移除，新增 `inbounds[]` 与 `configOverride`）；旧客户端与旧 Agent 不兼容，升级主控需同步升级 Agent 与 Web 面板。

## [0.2.0] - 2026-08-29

### Added

- 新增本地一键联调脚本 `scripts/dev-e2e.sh`：一键拉起主控 + Web 面板 + Agent + 真实 sing-box 内核（自动建/复用联调节点、查找 `.tools/sing-box/` 内核、复用已运行服务），用法见 `docs/DEPLOYMENT_GUIDE.md` §2.3。
- 多格式订阅生成器：`/sub/:token` 支持 Clash Meta YAML（`?type=clash` 或 User-Agent 含 Clash/meta/Mihomo，完整最小可用配置 + 策略组 + 兜底规则）与 Sing-box Client JSON（`?type=sing-box` 或 User-Agent 含 sing-box，vless 出站 + direct 兜底），显式参数优先于 UA 嗅探，默认仍为 Base64 URI 列表；三种格式均返回 `Subscription-Userinfo` 流量头。
- Sing-box 内核生命周期管理：Agent 内置 supervisor 单协程托管内核子进程（拉起、PID 监控、异常退出按指数退避自动拉起、SIGTERM 优雅停止）；`config_sync` 原子落盘后按字节比对决定是否优雅重启（内容未变且内核存活则跳过，避免无谓重启）；新增 `SINGBOX_BINARY_PATH` 环境变量指定内核二进制路径。
- 节点编辑与删除：`PATCH/DELETE /admin/nodes/:id`（编辑名称/地址/端口/是否对订阅公开，保存后在线节点自动热推送最新配置；删除先断开在线 Agent 再硬删除，流量记录级联清除）与节点管理页编辑弹窗、删除二次确认、操作列图标化。
- 主控端 Web 面板静态托管与 SPA 回退：生产模式下 NestJS 直接托管 `web/dist`（非 `/api` 的 GET 未命中时回退 index.html，History 路由刷新不再 404）；探测顺序 `WEB_DIST_PATH` → monorepo 开发布局 → 发行包 `web-dist/`，无面板资源时纯 API 模式可正常启动。
- 主控端自包含发行包：`scripts/release.sh` 新增装配步骤（生产依赖 + Web 面板 + `start.sh` 启动脚本 + README/.env.example），目标机 Node.js >= 20 解压即用；`start.sh` 校验 JWT_SECRET → 首启生成 Prisma client（目标平台引擎）→ `migrate deploy` → 启动。Release 资产自此覆盖三端（主控端 linux/amd64 包 + Agent 三平台二进制 + 校验和）。
- 用户注册：`POST /auth/register`（受系统设置注册开关控制，注册即登录）与注册页（确认密码校验、开关关闭时引导回登录页）。
- 订阅令牌重置：`POST /user/reset-sub`（旧链接立即失效）与仪表盘「重置链接」入口（AlertDialog 二次确认）。
- 管理员用户管理：`GET/POST/PATCH/DELETE /admin/users`（分页与邮箱搜索、创建、配额/到期/角色/激活/密码部分更新、删除级联流量记录；禁止删除自己与修改自己的角色；用户变动实时推送全部在线 Agent）与用户管理页（TanStack Table 五能力表格、创建/编辑弹窗、批量封禁/解封/删除）。
- 系统设置：SystemSetting 表首次启用（`siteName`/`registrationEnabled`/`defaultTrafficLimitBytes` 三键，缺省合并默认值），`GET/PUT /admin/settings` 与系统设置页；`GET /system/public-info` 公开站点信息；登录页与侧边栏展示自定义站点名。
- 前端基础设施：新增 shadcn 原子组件（select/switch/checkbox/alert-dialog/skeleton/tooltip/pagination）与 `shared/data-table` 通用表格封装（排序/分页/行选择/列可见性五能力）。

### Changed

- 发布自动化从 GitHub Actions 迁移为本地脚本 `scripts/release.sh`：在 Tag 提交上复跑三端门禁、交叉编译 Agent 三平台产物、打包生成 SHA-256 校验和、提取 CHANGELOG 版本小节为 Release Notes，并经 `gh` CLI 创建 GitHub Release（规避 Actions artifact 存储配额限制）；`release.yml` 工作流移除，PR 质量门禁流水线 `ci.yml` 保持不变。v0.1.0 的 GitHub Release 最终产物即由本地脚本构建发布。
- `prisma` CLI 由 devDependencies 升为 server 运行时依赖：主控端发行包的目标机需要它执行 `migrate deploy` 与首启 `generate`（Prisma client 引擎按目标平台生成，Prisma schema 的 `binaryTargets` 增加 `debian-openssl-3.0.x`）。

### Fixed

- 修复 Reality 密钥对生成格式错误：此前导出 PEM，而 sing-box 内核与客户端要求 32 字节裸密钥的 base64url（等价 `sing-box generate reality-keypair`），导致内核 inbound 初始化失败（`decode private key`）；已修复并新增回归测试。**修复前创建的节点密钥为坏值，需删除重建。**
- 修复 Agent 子进程退出未通知 supervisor 导致内核崩溃后不自愈的问题，并严格化对应测试（先观察退出再验证重拉）。

## [0.1.0] - 2026-08-29

### Added

- 建立 CI 质量门禁流水线（`.github/workflows/ci.yml`）：PR 与 main 推送自动运行三端门禁（server tsc/ESLint/Jest/nest build、web tsc/ESLint/vite build、agent vet/gofmt/test/build）与安全审计（`pnpm audit --audit-level high` + `govulncheck`）。
- 建立项目设计文档库：系统架构、技术选型、数据模型、接口与通信协议、部署运维指南、阶段实施路线图。
- 建立工程治理规范：版本管理规范（SemVer 最小递增 + Monorepo 统一版本号）、Git 版本管理规范（GitHub Flow + Conventional Commits 中英混合格式）、代码审查与架构约束（质量门禁 + NestJS/React/Go 分层硬约束 + 审查清单）、项目全局硬约束（技术栈锁定、零外部依赖、资源与安全红线、文档同步约束）。
- 建立前端 UI 设计与组件规范：`docs/FRONTEND_UI_GUIDELINES.md`（shadcn/ui New York 风格预设、Zinc 灰色系与暗黑模式、组件分层、禁止裸写原生 HTML 交互标签、React Hook Form + Zod 表单校验、Sonner 与 AlertDialog 交互反馈、TanStack Table 与 Recharts 图表规范）。
- 建立 AI 代理工作规范 `AGENTS.md`（按任务类型的必读文档索引、硬性规则摘要、变更-文档同步映射表）。
- 初始化 pnpm Monorepo 工程与治理工具链（husky/commitlint/lint-staged/.editorconfig），开发依赖缓存与便携工具链全部收进项目目录（`scripts/dev-env.sh`）。
- 主控后端：NestJS + Prisma + SQLite 数据层（四模型迁移与种子数据）、JWT 认证（登录/当前用户/角色守卫）、用户面板（仪表盘/节点列表）、节点管理（创建/列表/AgentToken 派发/X25519 Reality 密钥对生成/热重载指令）、Base64 订阅生成（vless:// URI 列表 + Subscription-Userinfo 响应头）、WebSocket Agent Gateway（握手鉴权/auth_result/config_sync 全量推送/心跳遥测入库/流量同事务扣减/断线与超时扫描置离线）、系统版本端点。
- 前端面板：Vite + React + shadcn/ui 工程（统一 Axios 客户端/Zustand Auth Store/TanStack Query/路由守卫）、登录页、用户仪表盘（流量进度/订阅链接一键复制/可用节点）、管理员节点页（5 秒遥测轮询/添加节点/安装命令展示/配置重载）。
- 边缘 Agent：Go 守护程序（WS 长连接鉴权、指数退避重连、5 秒心跳上报 CPU/内存/带宽、config_sync 原子落盘；Sing-box 内核生命周期留待后续版本）。

### Changed

- 文档同步落地状态：`API_AND_PROTOCOLS.md` 标注已实现端点（⭐）与首管理员 seed 引导机制；`DATA_MODELS.md` 说明 SQLite 下枚举落地为 String + 应用层校验；`TECH_STACK.md` 补充 bcryptjs 选型说明；`ROADMAP.md` 勾选 Phase 1 并标注最小 demo 进度。

### Fixed

- 修复登录后 `GET /auth/me` 与 `GET /user/dashboard` 返回 500：Prisma BigInt 字段（流量配额/已用）无法被 JSON 序列化，现于服务边界统一转为 Number（含回归测试）。
