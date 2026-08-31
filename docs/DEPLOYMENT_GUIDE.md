# 部署与运维指南 (Deployment & Operations Guide)

## 1. 主控端 (Master) 部署

主控端集成了前端 Web 面板、后端 API、SQLite 数据库与 WebSocket 实时网关。

### 1.1 环境要求
- Node.js >= 20.0.0
- pnpm >= 9.0.0
- Linux / macOS / Windows Server
### 1.2 方式一：自包含发行包部署（推荐，v0.2.0 起）

从 GitHub Release 下载 `riri-master_<version>_linux_amd64.tar.gz`（内置后端、Web 面板静态资源与全部生产依赖，目标机只需 Node.js >= 20）：

```bash
tar -xzf riri-master_<version>_linux_amd64.tar.gz && cd riri-master_<version>_linux_amd64
cp .env.example .env   # 编辑：JWT_SECRET 必填（openssl rand -hex 32）
./start.sh             # 首启自动：生成 Prisma client（Linux 引擎）→ migrate deploy → 启动
```

- 访问 `http://<host>:<port>` 即 Web 面板（生产模式下后端直接托管面板静态资源，非 `/api` 路径自动 SPA 回退）；API 文档 `/api/docs`。
- 首次登录账号：执行 `node node_modules/prisma/build/index.js db seed` 播种（凭据经 `SEED_ADMIN_EMAIL/PASSWORD` 覆盖，默认密码见包内 README），**登录后立即修改**。
- 主控端静态托管由 `apps/server/src/static/web-static.ts` 实现（探测顺序：`WEB_DIST_PATH` 环境变量 → monorepo 开发布局 → 发行包 `web-dist/`）。

### 1.3 方式二：源码构建与运行

```bash
# 1. 克隆代码并安装依赖
pnpm install

# 2. 生成 Prisma 数据库迁移与客户端（开发态）
pnpm --filter @riricloud/server exec prisma migrate dev

# 3. 构建前端与后端
pnpm --filter @riricloud/web build
pnpm --filter @riricloud/server build

# 4. 生产迁移后启动（web 构建产物由 server 托管）
pnpm --filter @riricloud/server exec prisma migrate deploy
pnpm --filter @riricloud/server start:prod
```

> 源码方式下 `start:prod` 同样会探测并托管 `apps/web/dist`（monorepo 布局自动命中）；`prisma migrate deploy` 不可省略（生产建表），与开发态 `migrate dev` 的区别见 Prisma 文档。

### 1.4 方式三：Docker Compose（规划中，Phase 5）

在生产服务器上使用 Docker Compose 运行主控端（镜像构建待 Phase 5 落地）：
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

> **Agent 环境变量**：`AGENT_TOKEN`（必填）、`MASTER_WS_URL`（默认 `ws://localhost:3000/ws/agent`）、`SINGBOX_CONFIG_PATH`（默认 `./config.json`）、`SINGBOX_BINARY_PATH`（sing-box 内核二进制路径，默认 `sing-box` 走 PATH）。内核缺失或启动失败时 Agent 按指数退避持续重试，不影响长连接与遥测。

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

### 2.3 本地一键联调（开发）

`scripts/dev-e2e.sh` 一键拉起全套本地联调环境（主控 + Web 面板 + Agent + 真实 sing-box 内核）：

```bash
bash scripts/dev-e2e.sh                  # 全套启动并跟踪 Agent 日志，Ctrl+C 退出
SKIP_WEB=1 bash scripts/dev-e2e.sh       # 不启动 Web 面板
NODE_PORT=9443 USE_MASTER_LOCAL=0 bash scripts/dev-e2e.sh # 使用独立联调节点并自定义端口
```

- 脚本自动完成：数据库迁移与播种（首次）、管理员登录、默认复用 seed 预置的 `Master-Local` 节点、构建并启动 Agent（`SINGBOX_BINARY_PATH` 默认查找 `.tools/sing-box/`）。如需使用独立联调节点，可设置 `USE_MASTER_LOCAL=0`，脚本会按 `127.0.0.1:<NODE_PORT>` 查找或创建节点，并复用或创建对应端口的 VLESS Reality 线路。
- 已在运行的 3000/5173 服务会被复用而非重启；脚本退出只回收其自身启动的进程。
- 若主控进程启动失败，脚本会立即输出 `server.log` 最近 40 行并退出，不再静默等待完整超时。
- 可验证的内核行为：配置下发拉起（含 `sing-box check` 预检）、面板编辑线路后优雅重启热应用、`taskkill` 内核后自动重拉、关闭 Agent 无残留进程。

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
4. 装配**主控端自包含发行包**（`pnpm --prod deploy` 生产依赖 + `web-dist/` 面板资源 + `start.sh`/README/.env.example + 版本号 package.json，模板维护在 `scripts/master-bundle/`）；
5. 打包 tar.gz / zip（Windows 环境无 zip 时自动回退 PowerShell `Compress-Archive`）并生成 `checksums.txt`（SHA-256，含主控端包）；
6. 提取 `CHANGELOG.md` 对应版本小节作为 Release Notes；
7. 通过 `gh` CLI 创建 GitHub Release 并附上全部产物与校验和——**Release 覆盖三端：主控端发行包 + Agent 三平台二进制**。

Tag 已存在则在该提交上构建（要求位于 main 历史上）；不存在则在当前 main HEAD 创建附注 Tag，发布成功后推送。

### 3.3 节点 Agent 升级
从 GitHub Release 下载对应架构的压缩包，校验 SHA-256 后替换二进制并 `systemctl restart riri-agent`。后续版本将提供 `install-agent.sh` 一键脚本（见 [ROADMAP.md](./ROADMAP.md) Phase 5）。

### 3.4 主控端升级
下载新版本 `riri-master_*.tar.gz` → 停服 → 解压新包替换目录 → 拷回旧目录的 `.env` 与数据库文件（`prisma/data/`）→ `./start.sh`（数据库迁移自动执行，`data/` 与 `.env` 独立于程序目录，升级不丢数据）。

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
- 检查 Sing-box 监听端口是否正常（将 `<port>` 替换为管理端显示的实际五位端口）：
  ```bash
  ss -tulpn | grep <port>
  ```
- 检查防火墙是否放行：
  ```bash
  ufw allow <port>/tcp
  ufw allow <port>/udp
  ```
