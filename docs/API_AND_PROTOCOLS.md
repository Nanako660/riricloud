# 接口与通信协议规范 (API & Protocols)

所有 HTTP 接口基于 `http(s)://<master-host>/api/v1` 前缀。

> **实现状态（v0.4.5）**：标注 ⭐ 的端点已实现；其余端点为完整版规划，随对应里程碑落地。鉴权采用 JWT Bearer Token，除 `@Public()` 显式放行的端点（登录、注册、订阅、版本、站点公开信息、Agent 二进制下载）外一律需要鉴权；管理员端点要求 `role=ADMIN`。
>
> **首管理员引导**：系统不提供「首个注册用户自动成为管理员」机制。首管理员由 Prisma seed 脚本播种（详见 `docs/DATA_MODELS.md` §种子数据），默认 `admin@riricloud.local`（密码经 `SEED_ADMIN_PASSWORD` 覆盖）。
>
> **统一分页结构**：列表端点返回 `{ data: T[], total: number, page: number, pageSize: number }`；查询参数 `page`（默认 1）、`pageSize`（默认 20，上限 100）。
>
> **管理操作保护规则**：管理员不能删除自己、不能修改自己的角色（防锁死）；批量封禁/解封/删除操作在服务端逐条执行且自动跳过操作者自身。

### 1.1 认证模块 (`/auth`)
- `POST /auth/register`：用户注册。⭐
  - 请求：`{ email, password(8~64) }`；注册开关（SystemSetting `registrationEnabled`）关闭时返回 403，邮箱已存在返回 409。
  - 响应：`{ accessToken }`（注册即登录）。新用户固定 `role=USER`，初始配额取系统设置 `defaultTrafficLimitBytes`，永久有效。
- `POST /auth/login`：登录获取 JWT 访问凭证 (`accessToken`)。⭐
- `GET /auth/me`：获取当前登录用户的详细信息、套餐与角色。⭐

### 1.2 用户面板 (`/user`)
- `GET /user/dashboard`：获取个人仪表盘数据（总配额、已用流量、剩余有效期、可用线路数及线路摘要）。⭐
- `GET /user/nodes`：兼容路径，获取当前用户有权访问的线路列表（响应同时保留 `nodes` 镜像字段）。⭐
- 前端路由 `/lines`：使用 `/user/subscription` 数据展示当前套餐授权线路。
- `POST /user/reset-sub`：重置用户的 `subscriptionToken`（防止订阅泄漏）。⭐ 响应 `{ subscriptionToken }`；旧链接立即失效（404）。
- `GET /plans/public`：公开套餐市场列表。⭐ 返回公开套餐及其价格、流量、有效期、节点匹配模式。
- `GET /user/subscription`：查询当前用户唯一订阅及按套餐匹配的可用线路。⭐ 无订阅时返回 `{ subscription: null, lines: [], nodes: [] }`；有订阅时返回 `lines[]`，并保留 `nodes` 兼容镜像。
- `POST /user/subscription`：订购公开套餐。⭐ 请求 `{ planId }`；已有有效订阅返回 409。
- `POST /user/subscription/upgrade`：即时升配。⭐ 请求 `{ planId }`；切换套餐、重置已用流量并按新套餐重算周期。
- `POST /user/subscription/cancel`：取消当前订阅。⭐ 状态变为 `CANCELED`，到期前保留使用权。
- `POST /user/subscription/reset-token`：重置当前订阅 Token。⭐ 旧订阅链接立即失效，并同步兼容的 User 镜像字段。

### 1.3 管理员模块 (`/admin`)

#### 用户管理
- `GET /admin/users?page&pageSize&search&role&isActive&subscriptionStatus&planId`：分页查询。⭐ `search` 为邮箱模糊匹配；支持角色、账号状态、订阅状态与套餐筛选；响应为统一分页结构，列表项不含 `passwordHash`/`uuid`/`subscriptionToken`，并聚合返回 `subscription{ id, status, trafficLimitBytes, trafficUsedBytes, startedAt, expireAt, plan{id,name} }`。
- `POST /admin/users`：创建用户。⭐ 请求 `{ email, password(8~64), role?, planId?(UUID|null), trafficLimitBytes?, expireAt?(ISO|null) }`；指定 `planId` 时在同一事务内创建唯一订阅，套餐配额/期限作为初始值且可由 `trafficLimitBytes`/`expireAt` 覆盖；明确传 `planId: null` 时创建无套餐用户；省略 `planId` 时自动绑定“体验套餐”（无该名称时取首个公开套餐）；邮箱冲突 409。
- `PATCH /admin/users/:id`：部分更新。⭐ 请求任意子集 `{ role?, trafficLimitBytes?(>0), expireAt?(ISO|null，null=永久), isActive?, password?(8~64，管理端重置) }`。
- `POST /admin/users/:id/reset-subscription-token`：管理员重置用户订阅 Token。⭐ 同步更新订阅实例与兼容的用户镜像字段，旧链接立即失效；无订阅用户仅更新用户镜像字段。
- `DELETE /admin/users/:id`：删除用户（级联删除流量记录）。⭐

用户创建/更新/删除均会触发向全部在线 Agent 推送 `config_sync`（订阅资格变化实时生效）。

#### 节点管理
- `GET /admin/nodes`：获取所有节点详情（包含 AgentToken、遥测状态、承载线路摘要与派生端口）。启动 bootstrap 会自动创建 `isLocal=true` 的 `Master-Local` 系统节点；Docker/发行包默认由 Master 内置 Agent 自动上线。⭐
- `GET /admin/nodes/:id`：获取单个节点详情（含承载线路、入口/出口角色、派生端口、安装命令、Agent/内核版本画像与最近探针快照）。⭐
- `POST /admin/nodes`：创建节点基础信息（生成 AgentToken 与双模式原生 CLI 安装命令）。⭐ 请求 `{ name?, serverHost, communicationMode?: "WS"|"HTTP" }`；线路通过 `/admin/lines` 独立管理，创建后响应 `{ node, agentToken, installCommand, installCommands: { ws, http }, uninstallCommand }`。
- `PATCH /admin/nodes/:id`：部分更新。⭐ 请求任意子集 `{ name?, serverHost?, configOverride?(string|null) }`；`configOverride` 为高级模式完整 sing-box 配置顶层覆盖 JSON（须为合法 JSON 对象，传 `null` 清除；合并语义见 `docs/DATA_MODELS.md` §3.2）；保存成功后若节点在线即向其推送 `config_sync`。
- `DELETE /admin/nodes/:id`：删除远程节点。⭐ 先断开该节点在线 Agent（close 4001），再硬删除；承载线路与 `TrafficLog` 级联删除；残留 Agent 重连时按无效 AgentToken 拒绝。`isLocal=true` 的 `Master-Local` 为系统保留节点，删除请求返回 `409`，只能通过禁用内置 Agent 或停止 Master 进程使其离线。
- `POST /admin/nodes/:id/reload`：向指定节点的 Agent 发送热重载指令。⭐
- `POST /admin/nodes/:id/upgrade`：下发 Sing-box 或 Agent 远程升级任务。⭐ 请求 `{ target: "singbox"|"agent", version?, url?, sha256? }`；省略 `url/sha256` 时由 Master 按节点 `osArch` 自动选择内置版本并生成带 AgentToken 的内部下载地址，二者必须同时提供才能使用自定义来源。Agent 下载后校验 SHA-256，返回 `{ taskId, requested }`。
- `POST /admin/nodes/:id/probe`：下发网络探针任务。⭐ 请求 `{ probes: [{ type: "tcp"|"dns"|"icmp", target, port?, timeoutMs? }] }`，最多 8 项；返回 `{ taskId, requested }`。回执会持久化到节点 `lastProbeResult`。
- `POST /admin/nodes/:id/restart-agent`：请求 Agent 自身平滑重启。⭐ 返回 `{ taskId, requested }`，Agent 在回执后使用原始命令行参数重新启动。
- `GET /admin/nodes/:id/tasks/:taskId`：查询探针/升级任务状态。⭐ 返回 `{ taskId, status: "PENDING"|"QUEUED"|"COMPLETED", success?, message? }`；任务结果由 Master 进程内短期保存，不引入外部队列。
- `POST /admin/nodes/reality-keypair`：生成 X25519 Reality 密钥对（32 字节裸密钥 base64url，等价 `sing-box generate reality-keypair`；不落库，供线路向导「生成密钥对」按钮使用）。⭐ 响应 `{ privateKey, publicKey }`。

#### 二进制分发中心
- `GET /downloads/agent?token=<AGENT_TOKEN>`：公开返回 Agent 二进制的 `302` 重定向。⭐ 安装器通过 `User-Agent: riri-agent-installer/<os>-<arch>` 声明目标平台，主控支持 Linux、macOS 和 Windows 的已装配架构；缺省目标为 `linux-amd64`。重定向目标仍由 AgentToken 保护，该端点无需 JWT。
- `GET /admin/binaries/info`：管理员查询主控版本及各 OS/架构内置 Agent、Sing-box 二进制的版本、大小、SHA-256 和可用状态。⭐
- `POST /admin/binaries/import`：管理员把自定义 Sing-box URL 下载到主控托管目录。⭐ 请求 `{ target: "singbox-linux-amd64"|"singbox-linux-arm64"|"singbox-macos-amd64"|"singbox-macos-arm64"|"singbox-windows-amd64", version, url, sha256 }`；服务端限制 100 MiB，并在落盘前完成 SHA-256 校验。
- `GET /downloads/binaries/:target?token=<AGENT_TOKEN>`：Agent 内部下载端点。⭐ 仅接受有效且未禁用节点的 AgentToken，响应为二进制流；禁止匿名访问。

#### 节点线路承载视图
节点不再提供独立的 Inbound CRUD。节点详情只读返回当前作为线路入口/出口的角色、线路协议和派生监听端口；新建或修改协议、参数、拓扑与端口统一通过线路 API 完成。

#### 线路管理
- `GET /admin/lines?page&pageSize&search&type&status&tag`：分页查询线路，可按名称/地址、类型、启停状态和标签筛选；响应包含 `tag`、`listen`、`protocolType`、脱敏后的 `params`、`topology`（入口/出口节点与端口）、最终生效的 `serverHost/serverPort` 和原始 `endpointOverrides`。旧客户端仍可读取只读 `targetInbound` 摘要。⭐
- `GET /admin/lines/:id`：查询线路详情及入口/出口节点关联、协议参数和端点解析结果。⭐
- `POST /admin/lines`：创建线路。⭐ 请求 `{ name, tag?, listen?, type?, protocolType?, params?, relayMode?, entryNodeId?, entryPort?, exitNodeId?, exitPort?, endpointOverrideEnabled?, serverHost?, serverPort?, serverName?, host?, trafficRate?, tags?, level?, sortOrder?, isPublic?, status? }`；`params` 按 `docs/DATA_MODELS.md` §3.1 归一化并在响应中脱敏。直连线路入口/出口节点与端口必须一致；中继线路必须指定入口、出口和机制，端口省略时由服务端在 `20000~29999` 范围随机分配五位端口。同节点同 TCP/UDP 传输层端口冲突返回 `409`，自定义 Tag 冲突返回 `409`，HYSTERIA2/TUIC 按 UDP 计算。
- `PATCH /admin/lines/:id`：部分更新线路，字段同创建请求。⭐ 保存后触发全量 Agent 配置推送防抖。
- `DELETE /admin/lines/:id`：删除线路。⭐
- `POST /admin/lines/:id/duplicate`（兼容别名 `/copy`）：复制线路，副本默认禁用；若端口冲突则为副本分配新的可用五位端口。⭐
- `POST /admin/lines/:id/test`：解析并返回最终对外端点、入口/出口节点与端口，不建立真实连接。⭐
- `POST /admin/lines/batch-status`：批量启用/禁用线路。⭐ 请求 `{ ids: UUID[], status: "ACTIVE"|"DISABLED" }`。
- `PATCH /admin/lines/reorder`：批量调整排序。⭐ 请求 `{ items: [{ id, sortOrder }] }`。

#### 系统设置
- `GET /admin/settings`：读取全量设置。⭐ 响应 `{ siteName, registrationEnabled, defaultTrafficLimitBytes }`。
- `PUT /admin/settings`：部分更新。⭐ 请求任意子集，键约束见 `docs/DATA_MODELS.md` §SystemSetting；响应返回更新后全量。

#### 套餐管理
- `GET /admin/plans?page&pageSize&search&isPublic`：分页查询套餐。⭐
- `GET /admin/plans/:id`：查询套餐详情。⭐
- `GET /admin/plans/:id/nodes`：兼容路径，按套餐规则计算当前可用线路。⭐
- `GET /admin/plans/:id/lines`：按套餐规则计算当前在线公开线路。⭐
- `POST /admin/plans`：创建套餐。⭐ 请求 `{ name, description?, price?, durationDays, trafficLimitBytes, lineMatchMode?, lineTags?, lineIds?, templateId?, isPublic?, sortOrder? }`。
- `PATCH /admin/plans/:id`：部分更新套餐。⭐
- `DELETE /admin/plans/:id`：删除未被订阅使用的套餐；已被使用时应改为 `isPublic=false` 下架。⭐

#### 订阅模板管理
- `GET /admin/subscription-templates`：查询模板列表及被套餐引用数量。⭐
- `GET /admin/subscription-templates/default`：查询全局默认模板。⭐
- `GET /admin/subscription-templates/:id`：查询模板详情。⭐
- `POST /admin/subscription-templates`：创建模板。⭐ 请求含 `proxyGroups?`、`ruleSets?`、`dnsConfig?`、`customInjectYaml?`、`customInjectJson?`、`isDefault?`。
- `PATCH /admin/subscription-templates/:id`：部分更新模板；YAML/JSON 覆写在服务端校验语法。⭐
- `DELETE /admin/subscription-templates/:id`：删除非默认且未被套餐使用的模板。⭐

#### 订阅管控
- `GET /admin/subscriptions?page&pageSize&search&status&planId`：分页查询订阅。⭐ 保留为兼容接口；管理端主入口已融合至 `/admin/users`。
- `GET /admin/subscriptions/:id`：查询订阅详情。⭐
- `POST /admin/subscriptions/users/:userId`：为尚无订阅的用户绑定套餐。⭐ 请求字段同管理员订阅调整接口，必须提供 `planId`；已有订阅时按更新语义处理。
- `PATCH /admin/subscriptions/:id`：管理员全量调整订阅。⭐ 支持 `planId`、`status`、`trafficLimitBytes`、`trafficUsedBytes`、`expireAt`、`addDays`；传 `planId: null` 会删除订阅实例，用户回到无套餐状态并使旧订阅 Token 失效。
- `POST /admin/subscriptions/:id/reset-token`：重置指定用户订阅 Token。⭐

### 1.4 系统模块 (`/system`)
- `GET /system/version`：返回统一版本号（读取根 `package.json`，见 `docs/VERSIONING.md` §3）。⭐
- `GET /system/public-info`：站点公开信息。⭐ 响应 `{ siteName, registrationEnabled }`（登录/注册页展示，不含敏感设置）。

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

### 2.2 消息类型枚举

#### 1. 认证与握手响应 (`auth_result`) —— Master -> Agent
```json
{
  "type": "auth_result",
  "data": {
    "success": true,
    "message": "Node authenticated successfully",
    "nodeId": "node-uuid-xxx"
  }
}
```

#### 2. 配置全量同步 (`config_sync`) —— Master -> Agent
当节点首次连接成功、或主控端发生用户/线路变动时，Master 向 Agent 实时推送最新的 Sing-box 运行配置。
`inbounds`、`outbounds` 与 `route` 均由该节点承担的启用 Line 自动派生；直连/协议代理线路生成协议入站，盲转发线路生成 `direct` 入站，监听地址使用 Line 的 `listen`，Tag 使用 Line 的自定义 Tag 或自动派生的稳定角色 Tag，`configOverride` 再按顶层深合并应用（含 `inbounds` 则整组替换）。历史 `NodeInbound` 不参与新配置生成。
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

中继配置示例：盲转发线路在入口节点生成如下端口转发入站；协议代理线路则生成与 Line 协议对应的入口入站、出口 outbound 以及 route rule。
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
线路 CRUD、套餐/用户订阅变动均通过现有 250ms 防抖机制触发相关在线节点的 `config_sync`；节点上的配置来源始终是 Line 与节点级 `configOverride`。

#### 3. 遥测心跳与流量上报 (`heartbeat`) —— Agent -> Master (每 5~10 秒)
```json
{
  "type": "heartbeat",
  "data": {
    "cpuUsage": 12.5,
    "memoryUsage": 38.2,
    "bandwidthRate": 1048576,
    "kernelRunning": true,
    "appliedConfigVersion": 3,
    "lastError": "",
    "trafficRecords": [
      { "userUuid": "user-uuid-1", "upload": 52428800, "download": 104857600 },
      { "userUuid": "user-uuid-2", "upload": 1024000, "download": 2048000 }
    ]
  }
}
```

> **实现状态**：`cpuUsage` / `memoryUsage` / `bandwidthRate` / `trafficRecords` 均已实现 ⭐。Agent 通过 Sing-box `experimental.v2ray_api` 的本地 gRPC `StatsService.QueryStats(reset=true)` 读取并清零本周期用户计数，`trafficRecords` 只携带正数增量；统计用户名称当前使用入站配置中的邮箱，Master 同时兼容按 UUID 或邮箱回查用户。共享密码模式的 Shadowsocks 入站没有可区分的用户身份，不产生按用户记录。
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
  "cpuUsage": 12.5,
  "memoryUsage": 38.2,
  "bandwidthRate": 1048576,
  "kernelRunning": true,
  "appliedConfigVersion": 3,
  "lastError": "",
  "agentVersion": "0.3.0",
  "osArch": "linux/amd64",
  "kernelVersion": "1.11.0",
  "trafficRecords": [],
  "configApplyResults": [
    { "version": 3, "success": true, "message": "ok" }
  ],
  "upgradeResults": [],
  "probeResults": [],
  "restartAgentResults": []
}
```

`configApplyResults`、`upgradeResults`、`probeResults`、`restartAgentResults` 是可选回执数组，每次最多各 8 项；请求仍会先按心跳同事务更新节点遥测与流量，再处理回执。

### 2.3.2 Master -> Agent 响应体

```json
{
  "needUpdate": true,
  "version": 4,
  "singboxConfig": { "log": { "level": "info" }, "inbounds": [], "outbounds": [{ "type": "direct", "tag": "direct" }] },
  "tasks": [
    { "type": "probe_task", "data": { "taskId": "task-uuid", "probes": [{ "type": "dns", "target": "example.com" }] } }
  ],
  "nextPollSecs": 15
}
```

当 `needUpdate=false` 时 `singboxConfig` 为 `null`；`tasks` 中的升级/探针/Agent 重启任务在 Agent 侧异步执行，并在下一次轮询的回执数组中提交。Master 会在回执到达前保留已投递任务，网络丢包后按 60 秒重试，回执成功后任务状态变为 `COMPLETED`。`nextPollSecs` 由节点配置给出，服务端限制在 5~300 秒。

### 2.3.3 健康判定

- WS/WSS：最后上报超过 15 秒且没有新连接时标记 `OFFLINE`。
- HTTP/HTTPS：最后上报超过 `3 × pollIntervalSecs`（默认 45 秒）时标记 `OFFLINE`。
- 任一模式重新上报都会恢复 `ONLINE`，并把 `communicationMode` 更新为实际传输模式。

---

## 3. 通用多格式订阅协议 (`/sub/:token`)

用户在各种客户端添加订阅链接：
```
http(s)://<master-host>/api/v1/sub/:token
```

> **实现状态（v0.4.0）**：三种格式、自动协商与全协议线路输出均已实现 ⭐。订阅按**线路**逐条生成：仅含公开、启用且入口/出口节点均在线的线路；线路输出使用其最终对外地址/端口，只有启用 `endpointOverrideEnabled` 时才应用线路 SNI/Host 覆盖，否则回退到 Line 自身的 TLS/Transport 参数，并保留倍率名称（如 `[1.5x]`）。单条线路对应一个 `protocolType` + `params`，重名全局去重；`nodes` 字段仅作为旧客户端兼容镜像。

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

> **协议兼容约束**：VMess 入站用户字段使用 `alterId`，Sing-box VMess 出站仍使用 `alter_id`；ShadowTLS 仅支持 v3，必须配置 SS2022 内层，服务端生成 `shadowtls` 外层入站与 `127.0.0.1:0` 的回环 SS 入站并通过 `detour` 串联，不再接受 v2 或独立 ShadowTLS 密码；SS2022 在共享模式、多用户模式和 ShadowTLS 内层均输出算法要求长度的 Base64 密钥。WebSocket 的 `host` 会转换为 `headers.Host`，不会写入 sing-box transport 顶层；TUIC `zero_rtt_handshake` 默认关闭。协议代理中继仅允许目标为 VLESS、VMess、Trojan、Hysteria2、TUIC、Shadowsocks 或 NaiveProxy，避免生成无法工作的本地代理出站。

### 3.2 流量与有效期标准响应头 (UserInfo Header)
订阅接口返回标准响应头，主流客户端会自动在首页显示流量条与过期日：
```http
Subscription-Userinfo: upload=524288000; download=2147483648; total=107374182400; expire=1789123456
```
