# 更新日志 (Changelog)

本项目的所有显著变更都记录在本文件中。

格式基于 [Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/)，
版本管理遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/) 与
[docs/VERSIONING.md](docs/VERSIONING.md)（最小递增原则、统一版本号、Tag 与本文件一一对应）。

变更类型说明：`Added` 新增 · `Changed` 变更 · `Fixed` 修复 · `Removed` 移除 · `Security` 安全 · `Deprecated` 弃用。
约定：功能/修复合入 main 时在 `[Unreleased]` 追加条目；发布时整理为版本小节并打 `vX.Y.Z` Tag。

## [Unreleased]

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
- 统一 sing-box 协议配置兼容性：修复 VMess 入站 `alterId`、ShadowTLS v3 `users`、SS2022 固定长度密钥、Reality 客户端 TLS、WebSocket `headers.Host` 与协议代理中继出站字段；TUIC 0-RTT 默认关闭。

- 深色主题色阶调优：消除 OLED 极黑刺眼眩光，升级为柔和深炭灰（`#141417`）与立体卡片（`#1c1c20`），降低纯白文字对比度至温润浅灰白（`#e4e4e7`），显著提升暗光环境下的阅读舒适度。
- 富文本编辑器深色模式自适应：为高级配置中的 CodeMirror JSON 编辑器绑定 `resolvedTheme` 主题适配，实现全站明暗模式与暗色代码高亮无缝联动。
- 选项卡平滑淡入动效：在 `TabsContent` 原子组件中注入 `data-[state=active]:animate-in`，使全局选项卡切换具备 200ms 丝滑过渡；详情页加载态升级为结构化骨架屏（Skeleton）。
- 前端侧边栏结构化分组：将侧边导航划分为「控制台（仪表盘）」与「管理后台（用户管理 / 节点管理 / 系统设置）」层级，提升层级认知清晰度。
- 用户仪表盘安全与客户端指引增强：普通用户主页剥离底层 VPS 机器与端口暴露表格，聚焦个人配额、到期时间、可用线路统计指标与「我的订阅」；新增 3 步客户端快速导入与连接指引。
- 节点详情管理与安全防护强化：明确「节点（宿主 VPS）- 入站（协议端口）- 线路（订阅代理项）」分层体系；详情页划分为「入站协议」、「基础与遥测」与「高级与运维」三大功能区；配置重载操作增加二次确认弹窗，删除节点操作收归高级选项卡底部危险操作区（Danger Zone）并增强拦截警示。
- 管理端订阅管控融合至用户管理：侧边栏收敛为 5 项，用户列表聚合套餐/订阅状态/流量/到期日并支持多维筛选；创建用户支持可选初始套餐或无套餐创建，编辑用户通过「账号安全 / 订阅管理」双 Tab 一站式管理，选择“无套餐”可彻底移除订阅；旧 `/admin/subscriptions` 页面重定向至用户管理，后端接口保持兼容。

### Fixed

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
