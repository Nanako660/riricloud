# 接口与通信协议规范 (API & Protocols)

所有 HTTP 接口基于 `http(s)://<master-host>/api/v1` 前缀。

生产环境推荐由 Nginx 负责 HTTPS 终止、反向代理和边缘路由。后端唯一真实订阅接口仍为 `GET /api/v1/sub/:token`；伪静态订阅地址由 Nginx 将严格匹配的 UUID 单段路径内部 rewrite 到该接口，不新增 NestJS 路由或通用代理 middleware。

> **实现状态（v0.4.20）**：标注 ⭐ 的端点已实现；其余端点为完整版规划，随对应里程碑落地。鉴权采用 JWT Bearer Token，除 `@Public()` 显式放行的端点（登录、注册、订阅、版本、站点公开信息、Agent 二进制下载）外一律需要鉴权；管理员端点要求 `role=ADMIN`。
>
> **首管理员引导**：系统不提供「首个注册用户自动成为管理员」机制。首管理员由 Prisma seed 脚本播种（详见 `docs/DATA_MODELS.md` §种子数据），默认 `admin@riricloud.local`（密码经 `SEED_ADMIN_PASSWORD` 覆盖）。
>
> **统一分页结构**：列表端点返回 `{ data: T[], total: number, page: number, pageSize: number }`；查询参数 `page`（默认 1）、`pageSize`（默认 20，上限 100）。
>
> **管理操作保护规则**：管理员不能删除自己、不能修改自己的角色（防锁死）；批量封禁/解封/删除操作在服务端逐条执行且自动跳过操作者自身。

### 1.1 认证模块 (`/auth`)
- `POST /auth/register`：用户注册。⭐
  - 请求：`{ email, password(8~64) }`；注册开关（SystemSetting `registrationEnabled`）关闭时返回 403，邮箱已存在返回 409；密码还需满足 `passwordMinLength`，并通过 `emailDomainMode` / `emailDomainList` 过滤。
  - 响应：`{ accessToken }`（注册即登录）。新用户固定 `role=USER`，初始配额取 `defaultTrafficLimitBytes`；配置 `defaultPlanId` 时自动激活公开套餐并同步订阅镜像，否则按 `defaultValidityDays` 计算有效期，0 为永久。
- `POST /auth/login`：登录获取 JWT 访问凭证 (`accessToken`)。⭐
- `GET /auth/me`：获取当前登录用户的详细信息、套餐与角色；用户自身视图额外返回 `balance`（分）和 `uuid`。⭐

### 1.2 用户面板 (`/user`)
- `GET /user/dashboard`：获取个人仪表盘数据（总配额、已用流量、剩余有效期、可用线路数及线路摘要）。⭐ **Deprecated**：前端已下线独立仪表盘并统一使用 `GET /user/subscription`；该接口仍保留以兼容外部脚本。
- `GET /user/nodes`：兼容路径，获取当前用户有权访问的线路列表（响应同时保留 `nodes` 镜像字段）。⭐
- 用户订阅页面使用 `/user/subscription` 数据展示当前套餐可用线路；用户侧不再提供独立线路页面。
- `POST /user/reset-sub`：重置用户的 `subscriptionToken`（防止订阅泄漏）。⭐ 响应 `{ subscriptionToken }`；旧链接立即失效（404）。
- `POST /user/change-password`：修改当前登录密码。⭐ 请求 `{ oldPassword, newPassword }`；旧密码校验通过后使用 bcrypt 更新。
- `POST /user/reset-uuid`：重置当前用户代理凭据（底层为 UUID）。⭐ 响应 `{ uuid }`；更新后向在线 Agent 全量推送配置，旧代理凭据立即失效。
- `GET /user/wallet`：查询账户钱包摘要。⭐ 响应 `{ balance, totalIncome, totalExpense, transactionCount }`，金额单位均为分。
- `GET /user/wallet/transactions?page&pageSize`：查询当前用户余额流水。⭐ 返回统一分页结构，流水包含 `amount`、`balanceBefore`、`balanceAfter`、`type`、`description`、`createdAt`。
- `POST /user/wallet/redeem`：兑换充值卡密。⭐ 请求 `{ code }`；卡密核销、余额增加和 `REDEEM` 流水在同一 SQLite 事务内完成，并发兑换只允许一次成功。
- `GET /plans/public`：公开套餐市场列表。⭐ 返回公开套餐及其价格、流量、有效期、`trafficResetMode` 和节点匹配模式。
- `GET /user/subscription`：查询当前用户唯一订阅及可用线路。⭐ 无订阅时返回 `{ subscription: null, lines: [], nodes: [] }`；有订阅时返回 `lines[]`，并保留 `nodes` 兼容镜像。订阅视图增加 `trafficResetMode`、`nextTrafficResetAt` 和 `extraLineIds`；线路为套餐匹配线路与用户额外授权线路的并集。
- `POST /user/subscription`：订购公开套餐。⭐ 请求 `{ planId }`；已有有效订阅返回 409；按套餐价格从余额扣款并写入 `PLAN_BUY` 流水，余额不足返回 400。
- `POST /user/subscription/renew`：续费当前套餐。⭐ 无请求体；按当前套餐价格扣款，顺延 `durationDays`、重置当期已用流量并写入 `PLAN_RENEW` 流水。
- `POST /user/subscription/upgrade`：即时升配。⭐ 请求 `{ planId }`；仅允许目标套餐价格不低于当前套餐，低价目标返回 409；通过校验后全价扣款，切换套餐、重置已用流量并按新套餐重算周期，写入 `PLAN_UPGRADE` 流水。
- `POST /user/subscription/cancel`：取消当前订阅。⭐ 状态变为 `CANCELED`，到期前保留使用权。
- `POST /user/subscription/reset-token`：重置当前订阅 Token。⭐ 旧订阅链接立即失效，并同步兼容的 User 镜像字段。

### 1.3 管理员模块 (`/admin`)

#### 用户管理
- `GET /admin/users?page&pageSize&search&role&isActive&subscriptionStatus&planId`：分页查询。⭐ `search` 为邮箱模糊匹配；支持角色、账号状态、订阅状态与套餐筛选；响应为统一分页结构，列表项不含 `passwordHash`/`uuid`/`subscriptionToken`，并聚合返回 `subscription{ id, status, trafficLimitBytes, trafficUsedBytes, startedAt, expireAt, trafficResetMode, nextTrafficResetAt, extraLineIds, plan{id,name} }`。
- `POST /admin/users`：创建用户。⭐ 请求 `{ email, password(8~64), role?, planId?(UUID|null), trafficLimitBytes?, expireAt?(ISO|null) }`；指定 `planId` 时在同一事务内创建唯一订阅，套餐配额/期限作为初始值且可由 `trafficLimitBytes`/`expireAt` 覆盖；明确传 `planId: null` 时创建无套餐用户；省略 `planId` 时自动绑定“体验套餐”（无该名称时取首个公开套餐）；邮箱冲突 409。
- `PATCH /admin/users/:id`：部分更新。⭐ 请求任意子集 `{ role?, trafficLimitBytes?(>0), expireAt?(ISO|null，null=永久), isActive?, password?(8~64，管理端重置) }`。
- `POST /admin/users/:id/reset-subscription-token`：管理员重置用户订阅 Token。⭐ 同步更新订阅实例与兼容的用户镜像字段，旧链接立即失效；无订阅用户仅更新用户镜像字段。
- `POST /admin/users/:id/adjust-balance`：管理员人工调账。⭐ 请求 `{ amount, description? }`，`amount` 为带符号分值；禁止调账后余额为负，并写入 `ADMIN_ADJUST` 流水。
- `DELETE /admin/users/:id`：删除用户（级联删除流量记录与余额流水）。⭐

用户创建/更新/删除均会触发向全部在线 Agent 推送 `config_sync`（订阅资格变化实时生效）。

#### 流量统计
- `GET /admin/traffic/overview?range=today|24h|7d|30d`：管理员查询全站流量统计。⭐ `range` 省略时默认为 `today`；响应包含 `summary`（总上行、总下行、物理/计费流量、活跃线路/用户）、连续补零的 `timeSeries`、按计费流量降序排列的 `lineRankings`，以及 `rate`/`rateSeries` 节点网络吞吐统计。速率统一为 `bytes/s`；`today`/`24h` 的速率按 5 分钟、`7d` 按 30 分钟、`30d` 按 1 小时输出。`rate` 的当前值只汇总在线且未超时节点，历史平均值按指标采样数计算，峰值为各节点桶峰值之和的近似全站峰值；速率不参与计费。
- `GET /admin/traffic/users/:userId?range=today|24h|7d|30d`：管理员查询指定用户的流量画像。⭐ 响应包含当前订阅/配额、选定周期 `summary`、补零时序和线路消耗清单；用户不存在返回 404，`userId` 必须为 UUID。

Agent 心跳写入 `TrafficLog` 时，Master 会优先关联该节点排序最靠前的 ACTIVE 入口线路；没有匹配线路时保留 `lineId=null`。聚合历史流水时会按节点首选 ACTIVE 入口线路回退归组，仍无法归属的数据标记为“未分配线路（节点直连）”。

#### 节点管理
- `GET /admin/nodes`：获取所有节点详情（包含 AgentToken、遥测状态、承载线路摘要与派生端口）。启动 bootstrap 会自动创建 `isLocal=true` 的 `Master-Local` 系统节点；Docker/发行包默认由 Master 内置 Agent 自动上线。⭐
- `GET /admin/nodes/:id`：获取单个节点详情（含承载线路、入口/出口角色、派生端口、安装命令、Agent/内核版本画像与最近探针快照）。⭐ 安装命令的公开地址优先使用系统设置 `publicBaseUrl`，其次使用 `RIRICLOUD_PUBLIC_URL`，最后使用当前请求的 `X-Forwarded-Proto` + `X-Forwarded-Host`/`Host` 自动匹配。
- `POST /admin/nodes`：创建节点基础信息（生成 AgentToken 与双模式原生 CLI 安装命令）。⭐ 请求 `{ name?, serverHost, communicationMode?: "WS"|"HTTP" }`；线路通过 `/admin/lines` 独立管理，创建后响应 `{ node, agentToken, installCommand, installCommands: { ws, http }, uninstallCommand }`。命令中的下载 URL、HTTP 轮询地址和 WS/WSS 地址使用同一公开地址解析结果。
- `PATCH /admin/nodes/:id`：部分更新。⭐ 请求任意子集 `{ name?, serverHost?, configOverride?(string|null) }`；`configOverride` 为高级模式完整 sing-box 配置顶层覆盖 JSON（须为合法 JSON 对象，传 `null` 清除；合并语义见 `docs/DATA_MODELS.md` §3.2）；保存成功后若节点在线即向其推送 `config_sync`。
- `DELETE /admin/nodes/:id`：删除远程节点。⭐ 先断开该节点在线 Agent（close 4001），再硬删除；承载线路与 `TrafficLog` 级联删除；残留 Agent 重连时按无效 AgentToken 拒绝。`isLocal=true` 的 `Master-Local` 为系统保留节点，删除请求返回 `409`，只能通过禁用内置 Agent 或停止 Master 进程使其离线。
- `POST /admin/nodes/:id/reload`：向指定节点的 Agent 发送热重载指令。⭐
- `POST /admin/nodes/:id/upgrade`：下发 Sing-box 或 Agent 远程升级任务。⭐ 请求 `{ target: "singbox"|"agent", version?, url?, sha256? }`；省略 `url/sha256` 时由 Master 按节点 `osArch` 自动选择内置版本并生成带 AgentToken 的内部下载地址，二者必须同时提供才能使用自定义来源。Agent 下载后校验 SHA-256，返回 `{ taskId, requested }`。
- `POST /admin/nodes/:id/probe`：下发网络探针任务。⭐ 请求 `{ probes: [{ type: "tcp"|"dns"|"icmp", target, port?, timeoutMs? }] }`，最多 8 项；返回 `{ taskId, requested }`。回执会持久化到节点 `lastProbeResult`。
- `POST /admin/nodes/:id/restart-agent`：请求 Agent 自身平滑重启。⭐ 返回 `{ taskId, requested }`，Agent 在回执后使用原始命令行参数重新启动。
- `GET /admin/nodes/:id/tasks/:taskId`：查询探针/升级任务状态。⭐ 返回 `{ taskId, status: "PENDING"|"QUEUED"|"COMPLETED", success?, message? }`；任务结果由 Master 进程内短期保存，不引入外部队列。
- `POST /admin/nodes/reality-keypair`：生成 X25519 Reality 密钥对（32 字节裸密钥 base64url，等价 `sing-box generate reality-keypair`；不落库，供线路向导「生成密钥对」按钮使用）。⭐ 响应 `{ privateKey, publicKey }`。

#### 二进制分发中心
- `GET /downloads/agent?token=<AGENT_TOKEN>`：公开返回 Agent 二进制的 `302` 重定向。⭐ 安装器通过 `User-Agent: riri-agent-installer/<os>-<arch>` 声明目标平台，主控支持 Linux、macOS 和 Windows 的已装配架构；缺省目标为 `linux-amd64`。重定向目标仍由 AgentToken 保护，该端点无需 JWT；重定向地址优先使用 `binaryDownloadBaseUrl`，其次使用 `publicBaseUrl`、`RIRICLOUD_PUBLIC_URL` 和当前请求域名，不再默认指向 localhost。
- `GET /admin/binaries/info`：管理员查询主控版本及各 OS/架构内置 Agent、Sing-box 二进制的版本、大小、SHA-256 和可用状态。⭐
- `POST /admin/binaries/import`：管理员把自定义 Sing-box URL 下载到主控托管目录。⭐ 请求 `{ target: "singbox-linux-amd64"|"singbox-linux-arm64"|"singbox-macos-amd64"|"singbox-macos-arm64"|"singbox-windows-amd64", version, url, sha256 }`；服务端限制 100 MiB，并在落盘前完成 SHA-256 校验。
- `GET /downloads/binaries/:target?token=<AGENT_TOKEN>`：Agent 内部下载端点。⭐ 仅接受有效且未禁用节点的 AgentToken，响应为二进制流；禁止匿名访问。

#### 节点线路承载视图
节点不再提供独立的 Inbound CRUD。节点详情只读返回当前作为线路入口/出口的角色、线路协议和派生监听端口；新建或修改协议、参数、拓扑与端口统一通过线路 API 完成。

#### 线路管理
- `GET /admin/lines?page&pageSize&search&type&status&tag`：分页查询线路，可按名称/地址、类型、启停状态和标签筛选；响应包含 `tag`、`listen`、`protocolType`、脱敏后的 `params`、`certificateId`/`certificate` 简要关联、`targetLineId`/`targetLine` 目标摘要、`topology`（入口/出口节点与端口）、最终生效的 `serverHost/serverPort` 和原始 `endpointOverrides`。旧客户端仍可读取只读 `targetInbound` 摘要。⭐
- `GET /admin/lines/:id`：查询线路详情及入口/出口节点关联、协议参数、证书简要信息和端点解析结果。⭐
- `POST /admin/lines`：创建线路。⭐ 请求 `{ name, tag?, listen?, type?, protocolType?, params?, relayMode?, targetLineId?, entryNodeId?, entryPort?, exitNodeId?, exitPort?, certificateId?(UUID|null), endpointOverrideEnabled?, serverHost?, serverPort?, serverName?, host?, trafficRate?, tags?, level?, sortOrder?, isPublic?, status? }`；`certificateId` 只能用于标准 TLS，关联后无需在 `params.tls` 中填写本地证书/私钥路径，Master 会在配置同步时注入最新 PEM。`params` 按 `docs/DATA_MODELS.md` §3.1 归一化并在响应中脱敏，TLS `alpn` 使用字符串数组，可按协议/传输层从预设值多选。直连线路入口/出口节点与端口必须一致；普通中继线路必须指定入口、出口和机制，`TARGET_LINE` 必须指定其他节点上的 `DIRECT` 目标线路，服务端自动同步 `exitNodeId`/`exitPort` 为目标线路的入口节点/端口。目标协议仅支持 `VLESS`、`VMESS`、`TROJAN`、`HYSTERIA2`、`TUIC`、`SHADOWSOCKS`、`NAIVE`。端口省略时由服务端在 `20000~65535` 范围随机分配五位端口。同节点同 TCP/UDP 传输层端口冲突返回 `409`，自定义 Tag 冲突返回 `409`，HYSTERIA2/TUIC 按 UDP 计算。
- `PATCH /admin/lines/:id`：部分更新线路，字段同创建请求。⭐ 保存后触发全量 Agent 配置推送防抖。
- `DELETE /admin/lines/:id`：删除线路。⭐ 被 `TARGET_LINE` 中继引用的线路会返回 `400`，必须先解除引用。
- `POST /admin/lines/:id/duplicate`（兼容别名 `/copy`）：复制线路，副本默认禁用；若端口冲突则为副本分配新的可用五位端口。⭐
- `POST /admin/lines/:id/test`：解析并返回最终对外端点、入口/出口节点与端口，不建立真实连接。⭐
- `POST /admin/lines/batch-status`：批量启用/禁用线路。⭐ 请求 `{ ids: UUID[], status: "ACTIVE"|"DISABLED" }`。
- `PATCH /admin/lines/reorder`：批量调整排序。⭐ 请求 `{ items: [{ id, sortOrder }] }`。

#### 证书管理
- `GET /admin/certificates?page&pageSize&search`：分页查询证书，支持按名称、主题、签发者和 SAN 搜索；响应为 `{ data, total, page, pageSize }`，返回 SAN、签发者、有效期、状态（`VALID`/`EXPIRING`/`EXPIRED`/`NOT_YET_VALID`）和关联线路数，不返回 PEM 私钥。⭐
- `GET /admin/certificates/:id`：查询证书详情，除列表字段外返回 `certificatePem` 与 `privateKeyPem` 明文，必须由管理员鉴权。⭐
- `POST /admin/certificates/parse`：前端预解析 PEM 证书。请求 `{ certificatePem, privateKeyPem? }`；使用 Node.js 原生 `crypto.X509Certificate` 提取 subject、issuer、serialNumber、SAN、有效期，并在提供私钥时校验公私钥匹配。⭐
- `POST /admin/certificates`：创建证书。请求 `{ name, certificatePem, privateKeyPem }`；仅接受包含 SAN 的 X.509 叶子证书和未加密 PEM 私钥，证书与私钥不匹配返回 `400`。⭐
- `PATCH /admin/certificates/:id`：更新证书名称或 PEM 内容；省略 `privateKeyPem` 时保留现有私钥。保存后自动查找关联线路的入口/出口节点并推送 `config_sync`，响应附带 `affectedNodeIds` 与 `syncedNodeIds`。⭐
- `DELETE /admin/certificates/:id`：删除未被线路引用的证书；仍有关联线路时返回 `409`。⭐

#### 系统设置
- `GET /admin/settings`：读取全量设置。⭐ 响应包含 `docs/DATA_MODELS.md` §SystemSetting 列出的全部强类型字段。
- `PUT /admin/settings`：部分更新。⭐ 请求任意子集，服务端校验范围、URL、邮箱、UUID、数组和探针对象；响应返回更新后全量。
- `POST /admin/settings/reset`：恢复默认设置。⭐ 请求 `{ keys?: string[] }`；省略 `keys` 时删除全部设置覆盖值，传入指定键时仅重置对应设置。

#### 卡密管理
- `GET /admin/redeem-codes?page&pageSize&search&status`：分页查询卡密，支持 `UNUSED`、`REDEEMED`、`REVOKED`、`EXPIRED` 状态筛选。⭐
- `POST /admin/redeem-codes/batch`：批量生成高强度卡密。⭐ 请求 `{ count, amount, prefix?, expiresAt?, note? }`；`amount` 为分，响应同时返回卡密列表和换行可复制的 `codes[]`。
- `POST /admin/redeem-codes/:id/revoke`：作废未使用卡密。⭐ 已兑换或已作废卡密返回 409。

#### 套餐管理
- `GET /admin/plans?page&pageSize&search&isPublic`：分页查询套餐。⭐
- `GET /admin/plans/:id`：查询套餐详情。⭐
- `GET /admin/plans/:id/nodes`：兼容路径，按套餐规则计算当前可用线路。⭐
- `GET /admin/plans/:id/lines`：按套餐规则计算当前可用公开线路。正常情况下要求入口/出口节点在线；Master 重启后的 60 秒恢复窗口内，若离线节点最近一次心跳仍在其通信模式对应的健康窗口内，也暂时保留线路，等待 Agent 重连。⭐
- `POST /admin/plans`：创建套餐。⭐ 请求 `{ name, description?, price?, durationDays, trafficLimitBytes, trafficResetMode?: "NONE"|"CALENDAR_MONTH"|"SUBSCRIPTION_CYCLE", lineMatchMode?, lineTags?, lineIds?, templateId?, isPublic?, sortOrder? }`；API 的 `price` 使用元且最多两位小数，服务端按分存储。
- `PATCH /admin/plans/:id`：部分更新套餐，`price` 使用元输入并转换为分保存，支持更新 `trafficResetMode`。⭐
- `DELETE /admin/plans/:id`：删除未被订阅使用的套餐；已被使用时应改为 `isPublic=false` 下架。⭐

#### 订阅模板管理
- 主控 JSON 与 URL-encoded 请求体上限为 `2 MiB`；超出上限在进入 Controller 前返回 HTTP `413 Payload Too Large`。订阅模板的策略组、规则集、DNS 与 YAML/JSON 覆写会合并在同一请求中，编辑大文本时应控制在该上限内。
- `GET /admin/subscription-templates`：查询模板列表及被套餐引用数量，包含 `isDefault` / `isBuiltin` 标记。⭐
- `GET /admin/subscription-templates/default`：查询全局默认模板。⭐
- `GET /admin/subscription-templates/:id`：查询模板详情。⭐
- `POST /admin/subscription-templates`：创建模板。⭐ 请求含 `proxyGroups?`（支持 `all` 动态节点展开、`DIRECT`/`REJECT` 与策略组引用）、`ruleSets?`、`dnsConfig?`、`customInjectYaml?`、`customInjectJson?`、`isDefault?`。
- `PATCH /admin/subscription-templates/:id`：部分更新模板；YAML/JSON 覆写在服务端校验语法。⭐
- `POST /admin/subscription-templates/preview`：渲染模板草稿。⭐ 请求 `{ format: "clash"|"singbox", template: { proxyGroups?, ruleSets?, dnsConfig?, customInjectYaml?, customInjectJson? } }`；优先使用当前可用线路，无可用线路时回退内置多协议 Mock 节点池，响应包含 `content`、`stats{totalNodes,matchedNodes,proxyGroupsCount,rulesCount}` 与 `warnings[]`。
- `POST /admin/subscription-templates/:id/duplicate`：复制模板并命名为 `${name} (副本)`；副本重置 `isDefault=false` 与 `isBuiltin=false`。⭐
- `DELETE /admin/subscription-templates/:id`：删除非默认、非内嵌且未被套餐使用的模板；内嵌默认模板只能通过 `PATCH` 修改，删除返回 `409`。⭐

#### 订阅管控
- `GET /admin/subscriptions?page&pageSize&search&status&planId`：分页查询订阅。⭐ 保留为兼容接口；管理端主入口已融合至 `/admin/users`。
- `GET /admin/subscriptions/:id`：查询订阅详情。⭐
- `POST /admin/subscriptions/users/:userId`：为尚无订阅的用户绑定套餐。⭐ 请求字段同管理员订阅调整接口，必须提供 `planId`；已有订阅时按更新语义处理。支持 `extraLineIds?: UUID[]` 全量设置用户额外线路授权，空数组表示清空。
- `PATCH /admin/subscriptions/:id`：管理员全量调整订阅。⭐ 支持 `planId`、`status`、`trafficLimitBytes`、`trafficUsedBytes`、`expireAt`、`addDays`、`extraLineIds`；传 `planId: null` 会删除订阅实例，用户回到无套餐状态并使旧订阅 Token 失效，但不会删除用户额外线路授权。
- `POST /admin/subscriptions/:id/reset-token`：重置指定用户订阅 Token。⭐

### 1.4 系统模块 (`/system`)
- `GET /system/version`：返回统一版本号（读取根 `package.json`，见 `docs/VERSIONING.md` §3）。⭐
- `GET /system/public-info`：站点公开信息。⭐ 响应 `{ siteName, siteDescription, logoUrl, faviconUrl, siteAnnouncement, footerCopyright, supportTelegramUrl, supportDiscordUrl, supportEmail, supportCustomUrl, registrationEnabled, subscriptionBaseUrl, subscriptionShortLinksEnabled, customCss, customHeadHtml }`；不包含 `publicBaseUrl`、套餐、JWT、Agent、二进制和探针运维参数。

订阅调试：`GET /api/v1/sub/:token?templateId=<UUID>` 可临时指定模板进行渲染，显式 `templateId` 仅用于调试并优先于套餐模板；省略时按套餐模板、系统设置 `defaultTemplateId`、`isDefault=true` 模板的顺序回退。

---

## 2. Master-Agent WebSocket (WSS) 通信协议

Agent 与 Master 之间建立全双工长连接，连接地址为：
```
ws(s)://<master-host>/ws/agent?token=<AGENT_TOKEN>
```

### 2.1 基础数据包格式 (JSON Frame)
```json
{
  "type": "MESSAGE_TYPE",
  "data": { ... }
}
```

当前 Master-Agent 协议版本为 **v2**。所有心跳和 HTTP 轮询请求必须携带 `protocolVersion: 2`；Master 拒绝 v1 或缺失版本字段，发布 v0.5.0 时必须先完成所有 Agent 的同步升级，不允许新旧协议混合运行。累计流量字段使用十进制字符串，避免 JavaScript `Number` 的安全整数限制。

### 2.2 消息类型枚举

#### 1. 认证与握手响应 (`auth_result`) —— Master -> Agent
```json
{
  "type": "auth_result",
  "data": {
    "success": true,
    "message": "Node authenticated successfully",
    "nodeId": "node-uuid-xxx",
    "protocolVersion": 2
  }
}
```

#### 2. 配置全量同步 (`config_sync`) —— Master -> Agent
当节点首次连接成功、或主控端发生用户/线路变动时，Master 向 Agent 实时推送最新的 Sing-box 运行配置。
`inbounds`、`outbounds` 与 `route` 均由该节点承担的启用 Line 自动派生；直连/协议代理线路生成协议入站，盲转发线路生成 `direct` 入站，`TARGET_LINE` 在入口生成当前线路协议入站与目标线路协议 outbound/route，在目标节点复用目标直连线路入站而不重复监听端口。监听地址使用 Line 的 `listen`，Tag 使用 Line 的自定义 Tag 或自动派生的稳定角色 Tag，`configOverride` 再按顶层深合并应用（含 `inbounds` 则整组替换）。历史 `NodeInbound` 不参与新配置生成。
`PROTOCOL_PROXY` 与 `TARGET_LINE` 的跨节点出站统一使用系统内部中继凭证，不借用任何普通用户凭证；对应出口入站仅注入该内部凭证（`TARGET_LINE` 追加到目标直连入站）。内部凭证固定为 `email=__riricloud_relay_transit__`、`uuid=00000000-0000-4000-8000-000000000002`、密码 `riricloud-internal-relay-transit-secret`，仅允许在 Master 生成的节点配置中使用。`experimental.v2ray_api.stats` 除 `users` 外还下发 `inbounds` 入站 Tag 列表，供 Agent 进行入站级统计。
Agent 收到后原子落盘（临时文件 + rename），并与最近一次配置做字节比对：内容变化则优雅重启内核使配置生效（sing-box 无原生 reload，重启即热应用）；内容相同且内核存活则跳过，避免无谓重启。
```json
{
  "type": "config_sync",
  "data": {
    "version": 1,
    "singboxConfig": {
      "log": { "level": "info" },
      "inbounds": [
        {
          "type": "vless",
          "tag": "vless-in",
          "listen": "0.0.0.0",
          "listen_port": 443,
          "users": [
            { "uuid": "user-uuid-1", "flow": "xtls-rprx-vision", "name": "user1@domain.com" },
            { "uuid": "user-uuid-2", "flow": "xtls-rprx-vision", "name": "user2@domain.com" }
          ],
          "tls": {
            "enabled": true,
            "server_name": "www.apple.com",
            "reality": {
              "enabled": true,
              "handshake": { "server": "www.apple.com", "server_port": 443 },
              "private_key": "...",
              "short_id": ["0123456789abcdef"]
            }
          }
        },
        {
          "type": "hysteria2",
          "tag": "hy2-in",
          "listen": "0.0.0.0",
          "listen_port": 8443,
          "up_mbps": 100,
          "down_mbps": 500,
          "users": [{ "name": "user1@domain.com", "password": "..." }],
          "tls": { "enabled": true, "server_name": "hy.example.com", "alpn": ["h3"], "certificate_path": "/etc/riricloud/cert.pem", "key_path": "/etc/riricloud/key.pem" }
        },
        {
          "type": "tuic",
          "tag": "tuic-in",
          "listen": "0.0.0.0",
          "listen_port": 8443,
          "congestion_control": "bbr",
          "users": [{ "uuid": "user-uuid-1", "name": "user1@domain.com", "password": "..." }],
          "tls": { "enabled": true, "server_name": "tuic.example.com", "alpn": ["h3"], "certificate_path": "…", "key_path": "…" }
        },
        {
          "type": "shadowsocks",
          "tag": "ss-in",
          "listen": "0.0.0.0",
          "listen_port": 8388,
          "method": "2022-blake3-aes-128-gcm",
          "password": "..."
        }
      ],
      "outbounds": [{ "type": "direct" }]
    }
  }
}
```

> 用户注入规则（与订阅输出一致，见 `docs/DATA_MODELS.md` §3.1）：vless/tuic 用 `User.uuid` 登录；hy2 密码取 `User.password ?? User.uuid`；ss 为入站共享密码不注入用户。

> 中继注入规则：协议代理/异构桥接出站使用上述内部中继凭证，出口节点的内部凭证流量仅维护 `TrafficCursor`，不生成 `TrafficLog`，不扣减任何普通用户或订阅配额。

中继配置示例：盲转发线路在入口节点生成如下端口转发入站；协议代理线路生成与 Line 协议对应的入口入站、出口 outbound 以及 route rule；`TARGET_LINE` 则将 outbound 的协议、参数、目标地址和端口取自所引用的直连线路。
```json
{
  "type": "direct",
  "tag": "relay-line-uuid",
  "listen": "0.0.0.0",
  "listen_port": 8443,
  "override_address": "203.0.113.10",
  "override_port": 443
}
```
线路 CRUD、套餐/用户订阅变动均通过现有 250ms 防抖机制触发相关在线节点的 `config_sync`；目标线路或目标节点地址变更也会刷新桥接入口节点。节点上的配置来源始终是 Line 与节点级 `configOverride`。

#### 3. 遥测心跳与流量上报 (`heartbeat`) —— Agent -> Master (每 5~10 秒)
```json
{
  "type": "heartbeat",
  "data": {
    "protocolVersion": 2,
    "cpuUsage": 12.5,
    "memoryUsage": 38.2,
    "bandwidthRate": 1048576,
    "uploadRate": 262144,
    "downloadRate": 786432,
    "kernelRunning": true,
    "appliedConfigVersion": 3,
    "lastError": "",
    "trafficSnapshots": [
      { "userUuid": "user-uuid-1", "uploadTotal": "52428800", "downloadTotal": "104857600" },
      { "userUuid": "user-uuid-2", "uploadTotal": "1024000", "downloadTotal": "2048000" }
    ]
  }
}
```

> **实现状态**：`cpuUsage` / `memoryUsage` / `bandwidthRate` / `uploadRate` / `downloadRate` / `trafficSnapshots` 均已实现 ⭐。Agent 通过 gopsutil 以 1 秒差分拆分网卡上行与下行速率，并保留 `bandwidthRate = uploadRate + downloadRate`；计数器回绕或采样异常时对应速率为 0。Agent 通过 Sing-box `experimental.v2ray_api` 的本地 gRPC `StatsService.QueryStats(reset=false)` 读取累计用户计数，Master 按节点与原始凭证维护 `TrafficCursor` 并计算增量，因此 Agent 不会因断线、重试或 Master 暂时不可用而清零统计数据。`uploadTotal` / `downloadTotal` 使用十进制字符串；统计用户名称当前使用入站配置中的邮箱，Master 同时兼容按 UUID 或邮箱回查用户。共享密码模式的 Shadowsocks 入站没有可区分的用户身份，不产生按用户记录。
>
> **落库约束**：Master 对同一节点的心跳按顺序处理，积压时仅保留最新遥测和累计快照；累计值相等不生成流水，计数器下降则按重启/重置处理并记录告警。未知凭证只建立游标基线，不计费。`TrafficLog.upload/download` 始终记录物理增量，用户与订阅配额按归属线路的 `trafficRate` 折算值批量扣减；没有归属线路时倍率按 `1.0` 处理。协议代理/异构桥接的内部凭证只更新 `TrafficCursor`，不生成流水或扣费。Master 写入流水时优先关联 ACTIVE 入口线路；没有入口线路时回退到 ACTIVE `RELAY + BLIND_FORWARD` 出口承载线路。`TrafficLog`、`Subscription.trafficUsedBytes`、`User.trafficUsedBytes` 与 `TrafficCursor` 在同一短事务内提交。节点遥测、速率聚合与流量账务分开落库，速率历史保留 30 天并由低频巡检清理。
>
> **内核与版本字段（v0.3.0，可选，向后兼容）**：`kernelRunning`（内核进程存活）、`appliedConfigVersion`（当前生效配置版本，对应 `config_sync.version`）、`lastError`（最近一次失败原因：check 失败/启动失败/异常退出采样 stderr 尾部 8KB；空串表示无错误）、`agentVersion`、`osArch`、`kernelVersion`。Master 落 `Node.kernelRunning` / `Node.configError` / `Node.agentVersion` / `Node.osArch` / `Node.kernelVersion`；旧版 Agent 不携带这些字段，对应列保持原值。

#### 4. 配置应用回执 (`config_apply_result`) —— Agent -> Master (v0.3.0)
Agent 处理每条 `config_sync` 后回执结果，Master 落 `Node.configError`（成功清空、失败记原因，截断 8KB）：
```json
{ "type": "config_apply_result", "data": { "version": 3, "success": true, "message": "ok" } }
```
失败示例（预检拒绝，Agent 侧已回滚 lastGood 配置、内核继续使用旧配置）：
```json
{ "type": "config_apply_result", "data": { "version": 4, "success": false, "message": "sing-box check: ERROR: decode inbound ..." } }
```

#### 5. 远程升级回执 (`upgrade_result`) —— Agent -> Master (v0.3.0)
```json
{
  "type": "upgrade_result",
  "data": {
    "taskId": "task-uuid",
    "target": "singbox",
    "version": "1.11.0",
    "success": true,
    "message": "ok"
  }
}
```

Agent 对下载文件流式计算 SHA-256；Sing-box 升级还会使用当前配置预检、停止旧进程、原子替换并确认新进程启动。新进程启动失败时恢复 `.riri-old` 备份并重试旧版本。Agent 自身升级成功后保留原命令行参数平滑重启。

#### 6. 网络探针回执 (`probe_result`) —— Agent -> Master (v0.3.0)
```json
{
  "type": "probe_result",
  "data": {
    "taskId": "task-uuid",
    "success": true,
    "results": [
      { "type": "tcp", "target": "example.com", "success": true, "latencyMs": 32, "packetLossPercent": 0 },
      { "type": "dns", "target": "example.com", "success": true, "latencyMs": 8, "addresses": ["93.184.216.34"], "packetLossPercent": 0 }
    ]
  }
}
```

Master 对 Agent 上行 JSON 做运行时结构校验：只接受 `heartbeat`、`config_apply_result`、`upgrade_result`、`probe_result`、`restart_agent_result` 五类上行消息，数值必须为有限/安全非负数，数组和文本字段有数量与长度上限；无效消息只记录脱敏告警，不进入业务服务。

## 2.4 二进制资源中心 API（v0.5.0）

以下管理接口均需要管理员 JWT 与 `ADMIN` 角色：

| 方法 | 路径 | 用途 |
| :--- | :--- | :--- |
| `GET` | `/api/v1/admin/binary-resources` | 按资源类型、版本、状态返回资源、平台资产、文件摘要与最近分发任务。 |
| `GET` | `/api/v1/admin/binary-resources/:id` | 查看资源详情、平台文件、引用任务和分发历史。 |
| `POST` | `/api/v1/admin/binary-resources/upload` | `multipart/form-data` 上传本地文件；表单字段与远程导入相同，文件上限 100 MiB。 |
| `POST` | `/api/v1/admin/binary-resources/import` | 按管理员提供的 HTTP(S) URL 下载并托管资源。 |
| `POST` | `/api/v1/admin/binary-resources/:id/activate` | 启用资源。 |
| `POST` | `/api/v1/admin/binary-resources/:id/disable` | 停用资源并取消默认标记。 |
| `POST` | `/api/v1/admin/binary-resources/:id/retire` | 归档资源并取消默认标记。 |
| `POST` | `/api/v1/admin/binary-resources/:id/default` | 将 ACTIVE 资源设为该类型默认版本。 |
| `GET` | `/api/v1/admin/binary-resources/:id/deployments` | 查看该资源最近 200 条分发任务。 |

导入/上传字段包括 `kind`、`upstreamVersion`、可选 `revision`、`target`、`sha256`、可选 `filename`、`builtFromAppVersion`、`compatibilityJson` 和 `notes`；远程导入另需 `url`。`kind` 为 `AGENT` 或 `SINGBOX`，`target` 形如 `singbox-linux-amd64`。服务端先完整下载到内存并计算 SHA-256，再以临时文件 + 原子 rename 写入资源目录，校验失败不会产生可用资产。

节点升级 `POST /api/v1/admin/nodes/:id/upgrade` 新增可选 `resourceId`。服务端根据节点 OS/架构选择资源的 `assetId`，下发响应包含 `resourceId`、`assetId`、主文件 URL/SHA-256 与 `files[]`；`files[]` 可包含 Sing-box 主文件及 `libcronet.so` 辅助文件。旧版 `target`、`version`、`url`、`sha256` 参数继续支持，旧 Agent 仍可执行只有单文件 URL/SHA-256 的 `upgrade_task`。

`upgrade_task` 新增可选字段如下：

```json
{
  "taskId": "task-uuid",
  "target": "singbox",
  "version": "1.14.0-r1",
  "resourceId": "release-uuid",
  "assetId": "asset-uuid",
  "operation": "UPGRADE",
  "url": "https://master.example.com/api/v1/downloads/binary-assets/asset-uuid?token=...",
  "sha256": "...",
  "files": [
    { "name": "sing-box", "role": "main", "url": "...", "sha256": "..." },
    { "name": "libcronet.so", "role": "auxiliary", "url": "...", "sha256": "..." }
  ]
}
```

兼容下载端点仍保留：`GET /api/v1/downloads/binaries/:target`、`GET /api/v1/downloads/binary-assets/:id` 与 `GET /api/v1/downloads/binary-files/:id`，均使用 AgentToken。升级任务状态、失败原因、重试和回滚结果写入 SQLite；WS 重连或 HTTP 轮询恢复时，Master 会重新投递尚未收到回执的 `DISPATCHED` 任务。

---

## 2.3 Master-Agent HTTP/HTTPS 轮询协议

HTTP 模式使用单一合一端点：
```
POST http(s)://<master-host>/api/v1/agent/poll
X-Agent-Token: <AGENT_TOKEN>
Content-Type: application/json
```

该端点通过 `@Public()` 绕过 JWT，但必须在 `X-Agent-Token` 中提供有效节点凭证；凭证无效、节点禁用或缺失时返回 `401`。HTTP 轮询与 WS 共用 `AgentService`，上行遥测、流量事务、配置回执和任务回执使用同一套业务规则。

### 2.3.1 Agent -> Master 请求体

```json
{
  "protocolVersion": 2,
  "cpuUsage": 12.5,
  "memoryUsage": 38.2,
  "bandwidthRate": 1048576,
  "uploadRate": 262144,
  "downloadRate": 786432,
  "kernelRunning": true,
  "appliedConfigVersion": 3,
  "lastError": "",
  "agentVersion": "0.3.0",
  "osArch": "linux/amd64",
  "kernelVersion": "1.11.0",
  "trafficSnapshots": [],
  "configApplyResults": [
    { "version": 3, "success": true, "message": "ok" }
  ],
  "upgradeResults": [],
  "probeResults": [],
  "restartAgentResults": []
}
```

`configApplyResults`、`upgradeResults`、`probeResults`、`restartAgentResults` 是可选回执数组，每次最多各 8 项；请求仍会先按心跳规则更新节点遥测与流量，再处理回执。节点遥测与流量账务分开落库，但流量日志和两处配额更新保持在同一短事务内。

### 2.3.2 Master -> Agent 响应体

```json
{
  "protocolVersion": 2,
  "needUpdate": true,
  "version": 4,
  "singboxConfig": { "log": { "level": "info" }, "inbounds": [], "outbounds": [{ "type": "direct", "tag": "direct" }] },
  "tasks": [
    { "type": "probe_task", "data": { "taskId": "task-uuid", "probes": [{ "type": "dns", "target": "example.com" }] } }
  ],
  "nextPollSecs": 15
}
```

当 `needUpdate=false` 时 `singboxConfig` 为 `null`；`tasks` 中的升级/探针/Agent 重启任务在 Agent 侧异步执行，并在下一次轮询的回执数组中提交。Master 会在回执到达前保留已投递任务，网络丢包后按 60 秒重试，回执成功后任务状态变为 `COMPLETED`。`nextPollSecs` 由节点配置给出，服务端限制在 5~300 秒。Master 返回的 `protocolVersion` 必须为 `2`，Agent 收到其他版本时拒绝继续通信并等待升级。

### 2.3.3 健康判定

- WS/WSS：最后上报超过 15 秒且没有新连接时标记 `OFFLINE`。
- HTTP/HTTPS：最后上报超过 `3 × pollIntervalSecs`（默认 45 秒）时标记 `OFFLINE`。
- 任一模式重新上报都会恢复 `ONLINE`，并把 `communicationMode` 更新为实际传输模式。
- Master 重启后的 60 秒内，订阅线路计算会对最近一次心跳仍处于上述健康窗口内的 `OFFLINE` 节点启用临时恢复宽限；超过宽限期或心跳已明显过期的节点仍会从订阅中移除，手动 `DISABLED` 节点不会被宽限放行。
- 离线扫描按扫描时读取的 `lastSeenAt` 做乐观并发校验；节点在扫描期间重新上报心跳时，旧扫描结果不会覆盖其在线状态。

---

## 3. 通用多格式订阅协议 (`/sub/:token`)

用户在各种客户端添加订阅链接：
```
http(s)://<master-host>/api/v1/sub/:token
```

### 3.0 Nginx 伪静态订阅地址

部署了 Nginx 示例配置后，可额外使用以下对外地址：

```text
GET https://<domain>/<UUID>
GET https://<domain>/<prefix>/<UUID>
```

这两个地址不是新的后端 API。Nginx 仅对严格匹配 UUID 的单段路径执行内部 rewrite：

```text
/<UUID>          -> /api/v1/sub/<UUID>
/<prefix>/<UUID> -> /api/v1/sub/<UUID>
```

rewrite 不覆盖原始查询字符串，因此 `?type=clash`、`?type=sing-box` 等参数会继续传给订阅接口；`User-Agent` 和订阅响应头也由 Nginx 原样转发。`/login`、`/admin`、`/api/**`、`/ws/agent` 等非 UUID 路径继续交给 Master，WebSocket 路径单独配置 Upgrade/Connection 头。无效 Token、过期订阅和禁用账号继续沿用后端现有的 404/403 语义。

前端系统设置 `subscriptionShortLinksEnabled` 默认关闭，只控制用户界面展示的链接形式，不检测 Nginx 是否已配置。`subscriptionBaseUrl` 可包含 pathname，例如 `https://domain.com/panel` 会生成 `https://domain.com/panel/<UUID>`；Nginx 的 location/rewrite 前缀必须与其保持一致。完整配置见 `scripts/nginx/riricloud.conf.example`。

> **实现状态（v0.4.0）**：三种格式、自动协商与全协议线路输出均已实现 ⭐。订阅引擎统一通过 `LinesService` 获取线路视图，不再回退到旧 Node 入站查询；订阅按**线路**逐条生成：仅含公开、启用且入口/出口节点均在线的线路，Master 重启后的短暂恢复宽限期内例外保留最近心跳仍有效的离线节点线路；线路输出使用其最终对外地址/端口，启用 `endpointOverrideEnabled` 时三种格式的 `server`/`server_port`（或 URI 主机/端口）均使用 `serverHost/serverPort` 覆盖值，并应用线路 SNI/Host 覆盖，否则回退到 Line 自身的 TLS/Transport 参数。单条线路对应一个 `protocolType` + `params`，重名全局去重；`nodes` 字段仅作为旧客户端兼容镜像。

### 3.1 客户端请求头自动识别与参数适配
- 格式协商优先级：显式 `?type=` 参数 > User-Agent 嗅探 > 默认 Base64。
- `?type=clash` 或 User-Agent 包含 `Clash` / `meta` / `Mihomo`：输出 **Clash Meta YAML**（`Content-Type: text/yaml`）。⭐ 完整最小可用配置：`mixed-port`/`mode`/`log-level` 基础段 + `proxies[]` + `节点选择` select 策略组 + `MATCH` 兜底规则。支持 VLESS、VMess、Trojan、Hysteria 2、TUIC、Shadowsocks 等主流协议代理（含 `ws-opts`、`grpc-opts`、`httpupgrade-opts`、`reality-opts`）。
- `?type=sing-box` 或 User-Agent 包含 `sing-box`：输出 **Sing-box Client JSON**（`Content-Type: application/json`）。⭐ `outbounds[]`（全协议出站，解耦 `transport` 与 `tls` 配置）+ `direct` 兜底出站，tag 同样去重。
- 默认输出经过 Base64 编码的标准 URI 列表（适配 Shadowrocket、v2rayN、v2rayNG、NekoBox 等）：⭐
  ```
  vless://<UUID>@<IP>:<PORT>?encryption=none&flow=xtls-rprx-vision&security=reality&sni=www.apple.com&fp=chrome&pbk=<PUBLIC_KEY>&sid=<SHORT_ID>&type=tcp#东京线路%20[1.5x]
  vmess://<BASE64_JSON>#东京线路
  trojan://<PASSWORD>@<IP>:<PORT>?sni=trojan.example.com&type=ws&path=/ws#东京线路
  hy2://<PASSWORD>@<IP>:<PORT>?sni=hy.example.com&alpn=h3&insecure=1&upmbps=100&downmbps=500#东京线路
  tuic://<UUID>:<PASSWORD>@<IP>:<PORT>?congestion_control=bbr&alpn=h3&sni=…&udp_relay_mode=native#东京线路
  ss://<BASE64URL(method:password)>@<IP>:<PORT>#东京线路   (SIP002)
  naive+https://<USERNAME>:<PASSWORD>@<IP>:<PORT>#东京线路
  ```
  凭证：hy2/trojan/tuic/naive 密码取 `User.password ?? User.uuid`；SS 共享模式使用入站密钥，多用户 SS2022 使用 `server_password:user_password`；vless/vmess/tuic 用户名为 `User.uuid`。

> **协议兼容约束**：VMess 入站用户字段使用 `alterId`，Sing-box VMess 出站仍使用 `alter_id`；ShadowTLS 仅支持 v3，必须配置 SS2022 内层，服务端生成 `shadowtls` 外层入站与 `127.0.0.1:0` 的回环 SS 入站并通过 `detour` 串联，不再接受 v2 或独立 ShadowTLS 密码；SS2022 在共享模式、多用户模式和 ShadowTLS 内层均输出算法要求长度的 Base64 密钥。WebSocket 的 `host` 会转换为 `headers.Host`，不会写入 sing-box transport 顶层；标准 TLS 的 ALPN 由线路 `params.tls.alpn` 数组透传，Reality 不携带 ALPN；TUIC `zero_rtt_handshake` 默认关闭。协议代理中继仅允许目标为 VLESS、VMess、Trojan、Hysteria2、TUIC、Shadowsocks 或 NaiveProxy，避免生成无法工作的本地代理出站。

### 3.2 流量与有效期标准响应头 (UserInfo Header)
订阅接口返回标准响应头，主流客户端会自动在首页显示流量条与过期日；`Profile-Update-Interval` 的值由 `subscriptionUpdateIntervalHours` 动态读取，`includeUsageHeaders=false` 时不返回用量头：
```http
Subscription-Userinfo: upload=524288000; download=2147483648; total=107374182400; expire=1789123456
Profile-Update-Interval: 24
```
