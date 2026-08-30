# 接口与通信协议规范 (API & Protocols)

所有 HTTP 接口基于 `http(s)://<master-host>/api/v1` 前缀。

> **实现状态（v0.3.0）**：标注 ⭐ 的端点已实现；其余端点为完整版规划，随对应里程碑落地。鉴权采用 JWT Bearer Token，除 `@Public()` 显式放行的端点（登录、注册、订阅、版本、站点公开信息、安装脚本）外一律需要鉴权；管理员端点要求 `role=ADMIN`。
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
- `GET /user/dashboard`：获取个人仪表盘数据（总配额、已用流量、剩余有效期、在线节点数）。⭐
- `GET /user/nodes`：获取当前用户有权访问的公开节点列表及状态。⭐
- `POST /user/reset-sub`：重置用户的 `subscriptionToken`（防止订阅泄漏）。⭐ 响应 `{ subscriptionToken }`；旧链接立即失效（404）。
- `GET /plans/public`：公开套餐市场列表。⭐ 返回公开套餐及其价格、流量、有效期、节点匹配模式。
- `GET /user/subscription`：查询当前用户唯一订阅及按套餐匹配的可用节点。⭐ 无订阅时返回 `{ subscription: null, nodes: [] }`。
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
- `GET /admin/nodes`：获取所有节点详情（包含 AgentToken、遥测状态与入站列表摘要）。⭐
- `GET /admin/nodes/:id`：获取单个节点详情（含完整入站列表）。⭐
- `POST /admin/nodes`：创建节点基础信息（生成 AgentToken 与一键安装命令）。⭐ 请求 `{ name?, serverHost, isPublic? }`；入站在详情页单独管理，创建后响应 `{ node, agentToken, installCommand }`。
- `PATCH /admin/nodes/:id`：部分更新。⭐ 请求任意子集 `{ name?, serverHost?, isPublic?, sortOrder?, configOverride?(string|null) }`；`configOverride` 为高级模式完整 sing-box 配置顶层覆盖 JSON（须为合法 JSON 对象，传 `null` 清除；合并语义见 `docs/DATA_MODELS.md` §3.2）；保存成功后若节点在线即向其推送 `config_sync`。
- `DELETE /admin/nodes/:id`：删除节点。⭐ 先断开该节点在线 Agent（close 4001），再硬删除；入站与 `TrafficLog` 级联删除；残留 Agent 重连时按无效 AgentToken 拒绝。
- `POST /admin/nodes/:id/reload`：向指定节点的 Agent 发送热重载指令。⭐
- `POST /admin/nodes/:id/upgrade`：下发 Sing-box 或 Agent 远程升级任务。⭐ 请求 `{ target: "singbox"|"agent", version, url, sha256 }`；Agent 下载后校验 SHA-256，返回 `{ taskId, requested }`。
- `POST /admin/nodes/:id/probe`：下发网络探针任务。⭐ 请求 `{ probes: [{ type: "tcp"|"dns"|"icmp", target, port?, timeoutMs? }] }`，最多 8 项；返回 `{ taskId, requested }`。
- `POST /admin/nodes/reality-keypair`：生成 X25519 Reality 密钥对（32 字节裸密钥 base64url，等价 `sing-box generate reality-keypair`；不落库，供入站表单「生成密钥对」按钮使用）。⭐ 响应 `{ privateKey, publicKey }`。

#### 节点入站管理（v0.3.0，多协议多入站）⭐
入站挂在节点下独立 CRUD；每次变更后若节点在线即推送 `config_sync`。入站响应中的 `params` 已剥离 `privateKey`（深度合并更新确保脱敏回传不丢失私钥）。

- `POST /admin/nodes/:id/inbounds`：创建入站。请求 `{ type(VLESS|VMESS|TROJAN|HYSTERIA2|TUIC|SHADOWSOCKS|NAIVE|SHADOWTLS|MIXED|SOCKS|HTTP|DIRECT), tag?, listen?(缺省 ::), port(1~65535), params?(结构见 docs/DATA_MODELS.md §3.1), sortOrder?, isPublic? }`。`tag` 缺省按协议前缀生成（冲突自动追加序号，显式冲突 409）；`params` 缺省值/自动生成由服务端归一化（Reality 密钥对、SS 密码自动生成）；同传输层端口冲突 409（QUIC 系 UDP 协议可与 TCP 协议同端口共存）。
- `PATCH /admin/nodes/:id/inbounds/:inboundId`：部分更新 `{ tag?, listen?, port?, params?, sortOrder?, isPublic? }`；`params` 与现有值**深度合并**后重新归一化（未提供的嵌套键如私钥保持原值）。
- `DELETE /admin/nodes/:id/inbounds/:inboundId`：删除入站。

#### 系统设置
- `GET /admin/settings`：读取全量设置。⭐ 响应 `{ siteName, registrationEnabled, defaultTrafficLimitBytes }`。
- `PUT /admin/settings`：部分更新。⭐ 请求任意子集，键约束见 `docs/DATA_MODELS.md` §SystemSetting；响应返回更新后全量。

#### 套餐管理
- `GET /admin/plans?page&pageSize&search&isPublic`：分页查询套餐。⭐
- `GET /admin/plans/:id`：查询套餐详情。⭐
- `GET /admin/plans/:id/nodes`：按套餐规则计算当前在线公开节点。⭐
- `POST /admin/plans`：创建套餐。⭐ 请求 `{ name, description?, price?, durationDays, trafficLimitBytes, nodeMatchMode?, nodeTags?, nodeIds?, templateId?, isPublic?, sortOrder? }`。
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
当节点首次连接成功、或主控端发生用户/入站变动时，Master 向 Agent 实时推送最新的 Sing-box 运行配置。
`inbounds` 按节点入站数组逐条组装（四协议结构见下），`configOverride` 顶层深合并（含 `inbounds` 则整组替换）。
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
          "listen": "::",
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
          "listen": "::",
          "listen_port": 8443,
          "up_mbps": 100,
          "down_mbps": 500,
          "users": [{ "name": "user1@domain.com", "password": "..." }],
          "tls": { "enabled": true, "server_name": "hy.example.com", "alpn": ["h3"], "certificate_path": "/etc/riricloud/cert.pem", "key_path": "/etc/riricloud/key.pem" }
        },
        {
          "type": "tuic",
          "tag": "tuic-in",
          "listen": "::",
          "listen_port": 8443,
          "congestion_control": "bbr",
          "users": [{ "uuid": "user-uuid-1", "name": "user1@domain.com", "password": "..." }],
          "tls": { "enabled": true, "server_name": "tuic.example.com", "alpn": ["h3"], "certificate_path": "…", "key_path": "…" }
        },
        {
          "type": "shadowsocks",
          "tag": "ss-in",
          "listen": "::",
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

> **实现状态**：`cpuUsage` / `memoryUsage` / `bandwidthRate` 已实现 ⭐；`trafficRecords` 为**增量**字节数（本心跳周期内），因 sing-box 官方统计接口（Clash API `/connections`）暂不提供连接到入站用户的归属字段，按用户流量采集暂缓、当前恒为空数组，待上游能力就绪后启用。
>
> **内核状态字段（v0.3.0，可选，向后兼容）**：`kernelRunning`（内核进程存活）、`appliedConfigVersion`（当前生效配置版本，对应 `config_sync.version`）、`lastError`（最近一次失败原因：check 失败/启动失败/异常退出采样 stderr 尾部 8KB；空串表示无错误）。Master 落 `Node.kernelRunning` / `Node.configError`（`lastError` 为空串时清空 configError）；旧版 Agent 不携带这些字段，对应列保持原值。

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
      { "type": "tcp", "target": "example.com", "success": true, "latencyMs": 32 },
      { "type": "dns", "target": "example.com", "success": true, "latencyMs": 8 }
    ]
  }
}
```

Master 对 Agent 上行 JSON 做运行时结构校验：只接受 `heartbeat`、`config_apply_result`、`upgrade_result`、`probe_result` 四类上行消息，数值必须为有限/安全非负数，数组和文本字段有数量与长度上限；无效消息只记录脱敏告警，不进入业务服务。

---

## 3. 通用多格式订阅协议 (`/sub/:token`)

用户在各种客户端添加订阅链接：
```
http(s)://<master-host>/api/v1/sub/:token
```

> **实现状态（v0.3.0）**：三种格式、自动协商与全协议多入站输出均已实现 ⭐。订阅按**入站**逐条生成：仅含公开节点的公开入站（`isPublic`）；单入站节点输出名为节点名，多入站节点为「节点名·tag」，重名全局去重。

### 3.1 客户端请求头自动识别与参数适配
- 格式协商优先级：显式 `?type=` 参数 > User-Agent 嗅探 > 默认 Base64。
- `?type=clash` 或 User-Agent 包含 `Clash` / `meta` / `Mihomo`：输出 **Clash Meta YAML**（`Content-Type: text/yaml`）。⭐ 完整最小可用配置：`mixed-port`/`mode`/`log-level` 基础段 + `proxies[]` + `节点选择` select 策略组 + `MATCH` 兜底规则。支持 VLESS、VMess、Trojan、Hysteria 2、TUIC、Shadowsocks 等主流协议代理（含 `ws-opts`、`grpc-opts`、`httpupgrade-opts`、`reality-opts`）。
- `?type=sing-box` 或 User-Agent 包含 `sing-box`：输出 **Sing-box Client JSON**（`Content-Type: application/json`）。⭐ `outbounds[]`（全协议出站，解耦 `transport` 与 `tls` 配置）+ `direct` 兜底出站，tag 同样去重。
- 默认输出经过 Base64 编码的标准 URI 列表（适配 Shadowrocket、v2rayN、v2rayNG、NekoBox 等）：⭐
  ```
  vless://<UUID>@<IP>:<PORT>?encryption=none&flow=xtls-rprx-vision&security=reality&sni=www.apple.com&fp=chrome&pbk=<PUBLIC_KEY>&sid=<SHORT_ID>&type=tcp#🇯🇵东京01·vless-in
  vmess://<BASE64_JSON>#🇯🇵东京01·vmess-in
  trojan://<PASSWORD>@<IP>:<PORT>?sni=trojan.example.com&type=ws&path=/ws#🇯🇵东京01·trojan-in
  hy2://<PASSWORD>@<IP>:<PORT>?sni=hy.example.com&alpn=h3&insecure=1&upmbps=100&downmbps=500#🇯🇵东京01·hy2-in
  tuic://<UUID>:<PASSWORD>@<IP>:<PORT>?congestion_control=bbr&alpn=h3&sni=…&udp_relay_mode=native#🇯🇵东京01·tuic-in
  ss://<BASE64URL(method:password)>@<IP>:<PORT>#🇯🇵东京01·ss-in   (SIP002)
  naive+https://<USERNAME>:<PASSWORD>@<IP>:<PORT>#🇯🇵东京01·naive-in
  ```
  凭证：hy2/trojan/tuic/naive 密码取 `User.password ?? User.uuid`；ss 为共享密码或多用户密码；vless/vmess/tuic 用户名为 `User.uuid`。

### 3.2 流量与有效期标准响应头 (UserInfo Header)
订阅接口返回标准响应头，主流客户端会自动在首页显示流量条与过期日：
```http
Subscription-Userinfo: upload=524288000; download=2147483648; total=107374182400; expire=1789123456
```
