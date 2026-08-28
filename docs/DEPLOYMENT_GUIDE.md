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

### 3.2 发布流程（本地脚本）
发布不依赖 GitHub Actions，在本地执行（Git Bash，需已登录 `gh` CLI）：

```bash
bash scripts/release.sh          # 缺省发布根 package.json 当前版本
bash scripts/release.sh vX.Y.Z   # 或显式指定 Tag
```

脚本自动完成（流程约定见 [VERSIONING.md](./VERSIONING.md) §6）：

1. 前置校验：main 分支、工作区干净且与远端同步、Tag 与根 `package.json` 统一版本号一致、CHANGELOG 存在对应版本小节、Release 未重复创建；
2. 在 Tag 指向的提交上（`git worktree` 隔离检出，不污染工作区）复跑三端质量门禁（与 CI 同一套命令）；
3. 交叉编译 Agent 多平台产物（`CGO_ENABLED=0` + `-trimpath`，版本号经 `-ldflags` 注入）：`linux/amd64`、`linux/arm64`、`windows/amd64`；
4. 打包 tar.gz / zip（Windows 环境无 zip 时自动回退 PowerShell `Compress-Archive`）并生成 `checksums.txt`（SHA-256）；
5. 提取 `CHANGELOG.md` 对应版本小节作为 Release Notes；
6. 通过 `gh` CLI 创建 GitHub Release 并附上全部产物与校验和。

Tag 已存在则在该提交上构建（要求位于 main 历史上）；不存在则在当前 main HEAD 创建附注 Tag，发布成功后推送。

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
