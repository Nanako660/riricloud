# 更新日志 (Changelog)

本项目的所有显著变更都记录在本文件中。

格式基于 [Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/)，
版本管理遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/) 与
[docs/VERSIONING.md](docs/VERSIONING.md)（最小递增原则、统一版本号、Tag 与本文件一一对应）。

变更类型说明：`Added` 新增 · `Changed` 变更 · `Fixed` 修复 · `Removed` 移除 · `Security` 安全 · `Deprecated` 弃用。
约定：功能/修复合入 main 时在 `[Unreleased]` 追加条目；发布时整理为版本小节并打 `vX.Y.Z` Tag。

## [Unreleased]

### Changed

- 深色主题色阶调优：消除 OLED 极黑刺眼眩光，升级为柔和深炭灰（`#141417`）与立体卡片（`#1c1c20`），降低纯白文字对比度至温润浅灰白（`#e4e4e7`），显著提升暗光环境下的阅读舒适度。
- 富文本编辑器深色模式自适应：为高级配置中的 CodeMirror JSON 编辑器绑定 `resolvedTheme` 主题适配，实现全站明暗模式与暗色代码高亮无缝联动。
- 选项卡平滑淡入动效：在 `TabsContent` 原子组件中注入 `data-[state=active]:animate-in`，使全局选项卡切换具备 200ms 丝滑过渡；详情页加载态升级为结构化骨架屏（Skeleton）。
- 前端侧边栏结构化分组：将侧边导航划分为「控制台（仪表盘）」与「管理后台（用户管理 / 节点管理 / 系统设置）」层级，提升层级认知清晰度。
- 用户仪表盘安全与客户端指引增强：普通用户主页剥离底层 VPS 机器与端口暴露表格，聚焦个人配额、到期时间、可用线路统计指标与「我的订阅」；新增 3 步客户端快速导入与连接指引。
- 节点详情管理与安全防护强化：明确「节点（宿主 VPS）- 入站（协议端口）- 线路（订阅代理项）」分层体系；详情页划分为「入站协议」、「基础与遥测」与「高级与运维」三大功能区；配置重载操作增加二次确认弹窗，删除节点操作收归高级选项卡底部危险操作区（Danger Zone）并增强拦截警示。

### Fixed

- 修复内核主动重启被误报为配置应用失败：配置变更触发的重启在 Windows 下经 Kill 退出码非 0，旧逻辑把被杀内核的最后 8KB 正常运行日志记为 `configError` 随心跳上报。主动停止（重启/Shutdown）现标记为预期退出——不记错误、不计退避；内核拉起成功即清除历史失败原因（崩溃自愈后面板不再显示陈旧错误）。
- 修复 Sing-box 升级窗口的 supervisor 竞态：停止旧内核后不再提前拉起旧二进制；新版本启动失败时恢复旧二进制并重新收敛内核。
- 修复同节点快速重连时旧 WebSocket 的 `close` 事件误把新连接标记为离线；Agent 自更新重启现在保留原始命令行参数。
- 修复套餐未显式绑定模板时未使用全局默认模板，以及套餐 `isPublic=false` 查询参数在转换后可能被误判为 true 的问题。

### Added

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
