# 接口与通信协议规范 (API & Protocols)

所有 HTTP 接口基于 `http(s)://<master-host>/api/v1` 前缀。

> **实现状态（v0.1.0）**：标注 ⭐ 的端点已在最小 demo 中实现；其余端点为完整版规划，随对应里程碑落地。鉴权采用 JWT Bearer Token，除 `@Public()` 显式放行的端点（登录、订阅、版本、安装脚本）外一律需要鉴权；管理员端点要求 `role=ADMIN`。
>
> **首管理员引导**：系统不提供「首个注册用户自动成为管理员」机制。首管理员由 Prisma seed 脚本播种（详见 `docs/DATA_MODELS.md` §种子数据），默认 `admin@riricloud.local`（密码经 `SEED_ADMIN_PASSWORD` 覆盖）。

### 1.1 认证模块 (`/auth`)
- `POST /auth/register`：用户注册（若系统开启注册开关）。（待实现）
- `POST /auth/login`：登录获取 JWT 访问凭证 (`accessToken`)。⭐
- `GET /auth/me`：获取当前登录用户的详细信息、套餐与角色。⭐

### 1.2 用户面板 (`/user`)
- `GET /user/dashboard`：获取个人仪表盘数据（总配额、已用流量、剩余有效期、在线节点数）。⭐
- `GET /user/nodes`：获取当前用户有权访问的公开节点列表及状态。⭐
- `POST /user/reset-sub`：重置用户的 `subscriptionToken`（防止订阅泄漏）。（待实现）

### 1.3 管理员模块 (`/admin`)
- `GET /admin/users`：分页查询用户列表，支持搜索。（待实现）
- `POST /admin/users`：创建新用户。（待实现）
- `PATCH /admin/users/:id`：修改用户配额、到期时间、角色与激活状态。（待实现）
- `DELETE /admin/users/:id`：删除用户。（待实现）
- `GET /admin/nodes`：获取所有节点详情（包含 AgentToken 与遥测状态）。⭐
- `POST /admin/nodes`：创建新节点（生成 AgentToken、Reality 密钥对与一键安装命令；当前版本仅支持 VLESS_REALITY）。⭐
- `PATCH /admin/nodes/:id`：修改节点参数（名称、IP、端口、协议参数）。（待实现）
- `DELETE /admin/nodes/:id`：删除节点。（待实现）
- `POST /admin/nodes/:id/reload`：向指定节点的 Agent 发送热重载指令。⭐

### 1.4 系统模块 (`/system`)
- `GET /system/version`：返回统一版本号（读取根 `package.json`，见 `docs/VERSIONING.md` §3）。⭐

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
当节点首次连接成功、或主控端发生用户增删变动时，Master 向 Agent 实时推送最新的 Sing-box 运行配置。
```json
{
  "type": "config_sync",
  "data": {
    "version": "1.0.0",
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
        }
      ],
      "outbounds": [{ "type": "direct" }]
    }
  }
}
```

#### 3. 遥测心跳与流量上报 (`heartbeat`) —— Agent -> Master (每 5~10 秒)
```json
{
  "type": "heartbeat",
  "data": {
    "cpuUsage": 12.5,
    "memoryUsage": 38.2,
    "bandwidthRate": 1048576,
    "trafficRecords": [
      { "userUuid": "user-uuid-1", "upload": 52428800, "download": 104857600 },
      { "userUuid": "user-uuid-2", "upload": 1024000, "download": 2048000 }
    ]
  }
}
```

---

## 3. 通用多格式订阅协议 (`/sub/:token`)

用户在各种客户端添加订阅链接：
```
http(s)://<master-host>/api/v1/sub/:token
```

> **实现状态（v0.1.0）**：默认 Base64 URI 列表输出与 `Subscription-Userinfo` 响应头已实现 ⭐；`?type` / User-Agent 自动识别与 Clash Meta YAML、Sing-box Client JSON 格式待后续 MINOR 版本落地。

### 3.1 客户端请求头自动识别与参数适配
- 若请求参数包含 `?type=clash` 或 User-Agent 包含 `Clash` / `meta` / `Mihomo`，输出 **Clash Meta YAML**。（待实现）
- 若请求参数包含 `?type=sing-box` 或 User-Agent 包含 `sing-box`，输出 **Sing-box Client JSON**。（待实现）
- 默认输出经过 Base64 编码的标准 URI 列表（适配 Shadowrocket、v2rayN、v2rayNG 等）：⭐
  ```
  vless://<UUID>@<IP>:<PORT>?encryption=none&flow=xtls-rprx-vision&security=reality&sni=www.apple.com&fp=chrome&pbk=<PUBLIC_KEY>&sid=<SHORT_ID>&type=tcp#🇯🇵东京01
  ```

### 3.2 流量与有效期标准响应头 (UserInfo Header)
订阅接口返回标准响应头，主流客户端会自动在首页显示流量条与过期日：
```http
Subscription-Userinfo: upload=524288000; download=2147483648; total=107374182400; expire=1789123456
```
