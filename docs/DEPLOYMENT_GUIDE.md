# 部署与运维指南 (Deployment & Operations Guide)

## 1. 主控端 (Master) 部署

主控端集成了前端 Web 面板、后端 API、SQLite 数据库与 WebSocket 实时网关。

### 1.1 环境要求
- Node.js >= 20.0.0
- pnpm >= 9.0.0
- Linux / macOS / Windows Server

### 1.2 源码构建与运行
```bash
# 1. 克隆代码并安装依赖
pnpm install

# 2. 生成 Prisma 数据库迁移与客户端
pnpm --filter @riricloud/server prisma migrate dev

# 3. 构建前端与后端
pnpm --filter @riricloud/web build
pnpm --filter @riricloud/server build

# 4. 启动服务 (生产模式)
pnpm --filter @riricloud/server start:prod
```

### 1.3 推荐 Docker Compose 一键部署
在生产服务器上，推荐使用 `docker-compose.yml` 运行主控端：
```yaml
version: '3.8'

services:
  master:
    image: riricloud/master:latest
    container_name: riri-master
    restart: always
    ports:
      - "8080:8080"
    volumes:
      - ./data:/app/data
    environment:
      - PORT=8080
      - DATABASE_URL=file:/app/data/riri.db
      - JWT_SECRET=your-super-secret-jwt-key
```

---

## 2. 节点端 (Edge Node Agent) 部署

### 2.1 方式一：一键 Shell 脚本部署 (推荐)
在主控面板点击“添加节点”后，复制对应的一键安装命令，登录节点 VPS 终端以 root 身份执行：

```bash
curl -fsSL https://<master-domain>/api/v1/install.sh | bash -s -- \
  --token=<YOUR_AGENT_TOKEN> \
  --master=wss://<master-domain>/ws/agent
```

#### 安装脚本后台执行步骤：
1. 检测 VPS 架构（`x86_64` / `aarch64` / `armv7`）。
2. 下载对应架构的 `riri-agent` 单二进制与官方 `sing-box` 代理内核。
3. 创建 `/etc/riri-agent/config.yaml` 存储 Token 与 Master 地址。
4. 注册并启动 `/etc/systemd/system/riri-agent.service`，设置为开机自启。

### 2.2 方式二：Docker 容器化部署
如果节点偏好容器化环境，可直接通过 Docker 启动：

```bash
docker run -d \
  --name riri-agent \
  --restart always \
  --network host \
  -e AGENT_TOKEN="<YOUR_AGENT_TOKEN>" \
  -e MASTER_WS_URL="wss://<master-domain>/ws/agent" \
  riricloud/agent:latest
```

---

## 3. 运维排错与常用指令

### 3.1 查看 Agent 运行状态与日志
```bash
# 查看 systemd 服务状态
systemctl status riri-agent

# 查看 Agent 实时日志
journalctl -u riri-agent -f -n 50

# 重启 Agent
systemctl restart riri-agent
```

### 3.2 节点网络与端口检测
- 检查 Sing-box 监听端口是否正常：
  ```bash
  ss -tulpn | grep 443
  ```
- 检查防火墙是否放行：
  ```bash
  ufw allow 443/tcp
  ufw allow 443/udp
  ```
