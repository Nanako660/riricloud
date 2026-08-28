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

## 3. 版本发布与产物分发

### 3.1 CI 质量门禁（自动）
PR 与 main 推送自动触发 `.github/workflows/ci.yml`：三端门禁（server tsc/lint/test/build、web tsc/lint/build、agent vet/gofmt/test/build）+ 安全审计（`pnpm audit --audit-level high`、`govulncheck`）。CI 未全绿禁止合并（见 [CODE_REVIEW.md](./CODE_REVIEW.md) §2）。

已评估豁免的 npm advisory 在根 `package.json` 的 `pnpm.auditConfig.ignoreGhsas` 登记（附 GHSA 编号与理由）。

### 3.2 发布流程（Tag 触发自动化）
在 main 上打附注 Tag `vX.Y.Z` 并推送后，`.github/workflows/release.yml` 自动完成（流程约定见 [VERSIONING.md](./VERSIONING.md) §6）：

1. 校验 Tag 与根 `package.json` 统一版本号一致（不一致直接失败）；
2. 复跑三端质量门禁（与 CI 同一套命令）；
3. 交叉编译 Agent 多平台产物（`CGO_ENABLED=0`，`-trimpath`，版本号经 `-ldflags` 注入）：`linux/amd64`、`linux/arm64`、`windows/amd64`，打包 tar.gz / zip 并生成 `checksums.txt`（SHA-256）；
4. 从 `CHANGELOG.md` 提取对应版本小节作为 Release Notes（找不到小节即失败，保证 Tag 与 CHANGELOG 一一对应）；
5. 创建 GitHub Release 并附上全部产物与校验和。

`workflow_dispatch` 手动触发为演练模式：只构建产物并上传 artifact，不创建 Release。

### 3.3 节点 Agent 升级
从 GitHub Release 下载对应架构的压缩包，校验 SHA-256 后替换二进制并 `systemctl restart riri-agent`。后续版本将提供 `install-agent.sh` 一键脚本（见 [ROADMAP.md](./ROADMAP.md) Phase 5）。

---

## 4. 运维排错与常用指令

### 4.1 查看 Agent 运行状态与日志
```bash
# 查看 systemd 服务状态
systemctl status riri-agent

# 查看 Agent 实时日志
journalctl -u riri-agent -f -n 50

# 重启 Agent
systemctl restart riri-agent
```

### 4.2 节点网络与端口检测
- 检查 Sing-box 监听端口是否正常：
  ```bash
  ss -tulpn | grep 443
  ```
- 检查防火墙是否放行：
  ```bash
  ufw allow 443/tcp
  ufw allow 443/udp
  ```
