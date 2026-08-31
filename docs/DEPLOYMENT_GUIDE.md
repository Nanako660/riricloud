# 部署与运维指南 (Deployment & Operations Guide)

## 1. 主控端 (Master) 部署

主控端集成了前端 Web 面板、后端 API、SQLite 数据库与 WebSocket 实时网关。

### 1.1 环境要求
- Node.js >= 20.0.0
- pnpm >= 9.0.0
- Linux / macOS / Windows Server
### 1.2 方式一：自包含发行包部署（推荐，v0.2.0 起）

从 GitHub Release 下载 `riri-master_<version>_linux_amd64.tar.gz`（内置后端、Web 面板静态资源、Linux x64 本机 Agent、Sing-box 与全部生产依赖，目标机只需 Node.js >= 20）：

```bash
tar -xzf riri-master_<version>_linux_amd64.tar.gz && cd riri-master_<version>_linux_amd64
cp .env.example .env   # 编辑：JWT_SECRET、ADMIN_EMAIL、ADMIN_PASSWORD 必填
./start.sh             # 首启自动：生成 Prisma client → migrate deploy → admin/Master-Local bootstrap → 启动 Master + 内置 Agent
```

- 访问 `http://<host>:<port>` 即 Web 面板（生产模式下后端直接托管面板静态资源，非 `/api` 路径自动 SPA 回退）；API 文档 `/api/docs`。
- 首次启动空数据库时，bootstrap 按 `ADMIN_EMAIL`、`ADMIN_PASSWORD` 创建首个管理员；兼容旧配置 `SEED_ADMIN_EMAIL`、`SEED_ADMIN_PASSWORD`，不再提供生产默认管理员密码。
- 生产环境 `AUTO_SEED=false` 时只创建管理员和系统保留的 `Master-Local`，不会创建演示用户、套餐、模板和线路；开发/演示环境明确设置 `AUTO_SEED=true` 才会执行完整演示 seed。
- 重置已有管理员密码：`./admin-reset.sh --email admin@example.com`（默认隐藏交互输入）；自动化场景可用 `printf '%s\n' 'new-password' | ./admin-reset.sh --email admin@example.com --password-stdin`。该命令不会创建或提权账号。
- 主控端静态托管由 `apps/server/src/static/web-static.ts` 实现（探测顺序：`WEB_DIST_PATH` 环境变量 → monorepo 开发布局 → 发行包 `web-dist/`）。
- 主控二进制分发目录为发行包内的 `binaries/`；其中 `agent-linux-amd64` 与 `singbox-linux-amd64` 供内置本机 Agent 使用，其他架构资产用于远程 Agent 升级。生产环境建议设置 `MASTER_LOCAL_HOST=<master-domain>`，或设置 `RIRICLOUD_PUBLIC_URL=https://<master-domain>` 自动推导订阅地址；否则新库默认使用本机回环地址。

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
pnpm --filter @riricloud/server exec node prisma/bootstrap-admin.js
pnpm --filter @riricloud/server start:prod
```

> 源码方式下请先在当前 shell 或 `apps/server/.env` 设置强随机 `JWT_SECRET` 与首次启动所需的 `ADMIN_EMAIL`、`ADMIN_PASSWORD`；`start:prod` 会探测并托管 `apps/web/dist`（monorepo 布局自动命中）。`prisma migrate deploy` 与 `bootstrap-admin.js` 不可省略，已有管理员时 bootstrap 会安全跳过。

### 1.4 方式三：Docker Compose

仓库根目录提供主控 `Dockerfile`、远程节点 `Dockerfile.agent` 与 `docker-compose.yml`。主控镜像已经内置 Linux Agent 和 Sing-box；`Dockerfile.agent` 仅用于远程 VPS 节点。Docker 构建、镜像导出和 Compose 运行均应在 WSL/Linux Docker 环境执行；Windows PowerShell 仅用于调用 `wsl.exe`，不承担 Docker 测试：

```bash
cp .env.example .env  # 或手动创建 .env
# 填写 JWT_SECRET、ADMIN_EMAIL、ADMIN_PASSWORD、MASTER_LOCAL_HOST；生产环境保持 AUTO_SEED=false
pnpm docker:build
pnpm docker:up
```

若 WSL 仅能调用 Windows `node.exe`、尚未安装 Linux Node.js/pnpm，可直接使用同一脚本：

```bash
bash scripts/docker-build.sh build
bash scripts/docker-build.sh up
```

脚本会自动读取根 `package.json` 版本，并兼容 WSL 的 `node.exe` 路径。

`pnpm docker:build` 会从根 `package.json` 读取当前版本号，并为两个组件各创建两个标签：

```text
riricloud/master:<version>
riricloud/master:latest
riricloud/agent:<version>
riricloud/agent:latest
```

同一次构建默认还会把镜像导出到仓库根目录 `docker-images/`：

```text
docker-images/riricloud-master_<version>_linux_amd64.tar.gz
docker-images/riricloud-agent_<version>_linux_amd64.tar.gz
docker-images/riricloud-docker-images_<version>_linux_amd64.manifest.json
docker-images/riricloud-docker-images_<version>_linux_amd64.sha256
```

导出包内同时保留版本标签和 `latest` 标签；manifest 记录组件、标签、平台、Sing-box 版本、OCI 元数据和 SHA-256。只导出现有镜像可执行 `pnpm docker:export`，查看本次构建的完整标签可执行 `pnpm docker:tags`。导出目录可通过 `DOCKER_EXPORT_DIR=/path/to/output` 覆盖，构建但不导出可使用 `DOCKER_EXPORT=false pnpm docker:build`。

运行时镜像使用 Distroless 基础镜像。以 2026-08-31 在 WSL Ubuntu 构建的 `linux/amd64` 结果为参考，Master 镜像约 `376 MB`、压缩导出包约 `87 MB`；Agent 镜像约 `155 MB`、压缩导出包约 `38 MB`。Master 的 Prisma Client 在构建阶段生成，并清理非 SQLite 运行时文件；Agent 的主要体积来自内置的 sing-box，实际体积会随平台和上游基础镜像更新略有变化。

主控容器监听容器内 `3000` 端口，内置 Agent 与 Sing-box 使用同一容器运行，SQLite 数据持久化到 Compose 命名卷 `master-data`；启动入口自动执行 `migrate deploy`、管理员 bootstrap 和 `Master-Local` bootstrap，只有 `AUTO_SEED=true` 才幂等播种演示数据（默认 `false`）。容器内显式重置命令为：

```bash
docker compose exec master /nodejs/bin/node /app/prisma/admin-reset.js --email admin@example.com
printf '%s\n' 'new-password' | docker compose exec -T master /nodejs/bin/node /app/prisma/admin-reset.js --email admin@example.com --password-stdin
```

Compose 在 Linux/WSL 下使用 `network_mode: host`，`MASTER_PORT` 同时控制 Master 面板监听端口；本机 Agent 动态使用的 TCP/UDP 线路端口会直接监听宿主机，不需要映射上万条端口。Compose 不固定 `container_name`，可用项目名同时运行多个实例。生产环境应设置 `MASTER_LOCAL_HOST`，或设置 `RIRICLOUD_PUBLIC_URL` 让 bootstrap 自动推导本机线路对外地址。Compose 默认引用 `latest`，`pnpm docker:up` 会注入当前版本和 Git 构建元数据。

导入离线镜像时，在目标 Docker 环境执行：

```bash
gzip -dc docker-images/riricloud-master_<version>_linux_amd64.tar.gz | docker load
# 只有需要在同一 Compose 中联调远程 Agent 时，才额外加载 Agent 镜像
# gzip -dc docker-images/riricloud-agent_<version>_linux_amd64.tar.gz | docker load
(cd docker-images && sha256sum -c riricloud-docker-images_<version>_linux_amd64.sha256)
```

仓库另提供 `docker-compose.image.yml` 与 `.env.image.example`，用于直接运行已经导入的镜像。该模板不包含 `build` 配置，并设置 `pull_policy: never`，适合离线或受限网络环境：

```bash
cp .env.image.example .env.image
# 编辑 .env.image：默认固定使用 0.2.0，可改为 latest；填写 JWT_SECRET、ADMIN_EMAIL、ADMIN_PASSWORD
docker compose --env-file .env.image -f docker-compose.image.yml up -d --no-build master
docker compose --env-file .env.image -f docker-compose.image.yml ps
```

Master 本机 Agent 会随 `master` 服务自动启动，无需启用独立 Agent profile。只有在同一 Compose 中联调额外远程节点时，才创建节点并取得该远程节点的 AgentToken 后启用 Agent profile：

```bash
docker compose --env-file .env.image -f docker-compose.image.yml --profile agent up -d --no-build
```

该模板与标准 `docker-compose.yml` 使用相同的 `master-data` 和 `agent-data` 命名卷，切换部署模板时不会改变数据库持久化位置。停止服务使用 `docker compose ... down`，不要使用 `down -v`，否则会删除数据库卷。

远程节点容器使用 `--network host` 语义，内置静态 `riri-agent` 与官方 sing-box `1.14.0`，默认不自动启动以避免空 AgentToken 容器反复重启。Master 本机 Agent 不使用该服务；创建远程节点并取得 Token 后，在 `.env` 中设置 `AGENT_TOKEN`，再执行：

```bash
COMPOSE_PROFILES=agent pnpm docker:up
```

可通过 `AGENT_MASTER_URL`、`AGENT_MODE=http`、`POLL_INTERVAL_SECS` 切换 Agent 的主控地址与 HTTP 轮询模式。停止并清理容器：

```bash
pnpm docker:down
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

如果节点所在网络不支持 WebSocket Upgrade，可在安装向导切换为 HTTP 模式：

```bash
curl -fsSL https://<master-domain>/api/v1/install.sh | bash -s -- \
  --token=<YOUR_AGENT_TOKEN> \
  --master=https://<master-domain>
```

#### 安装脚本后台执行步骤：
1. 检测 VPS 架构（`x86_64` / `aarch64`）；当前发行包资产暂不包含 `armv7`。
2. 从主控 `GET /api/v1/install.sh` 下载对应架构的 `riri-agent` 与 Sing-box 资产，下载请求使用 `x-agent-token` 鉴权。
3. 写入 `/etc/riri-agent/agent.env`（权限 `0600`），配置 Token、Master 地址、通信模式和 `/var/lib/riri-agent/config.json` 数据路径；后续升级无需节点直接访问 GitHub。
4. 写入并启动 `/etc/systemd/system/riri-agent.service`，设置为开机自启；安装目录为 `/opt/riri-agent`。

安装脚本由主控的 `GET /api/v1/install.sh` 公开提供，也随主控自包含发行包以 `install-agent.sh` 文件提供。脚本支持 `--token TOKEN`、`--master URL`、`--mode ws|http`，`--master` 可传 `ws://`、`wss://`、`http://` 或 `https://` 地址。

> **Agent 环境变量**：`AGENT_TOKEN`（必填）；推荐使用 `MASTER_URL`（WS/WSS 地址如 `wss://<master>/ws/agent`，HTTP/HTTPS 模式可填主控根地址）；`AGENT_MODE=ws|http` 可显式指定模式，未指定时按 URL 协议前缀推导；`POLL_INTERVAL_SECS` 默认 15 秒、范围 5~300 秒；`MASTER_WS_URL` 继续兼容旧版 Agent。另有 `SINGBOX_CONFIG_PATH`（默认 `./config.json`）与 `SINGBOX_BINARY_PATH`（默认 `sing-box`）。

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

HTTP 容器模式只需替换为：

```bash
  -e MASTER_URL="https://<master-domain>" \
  -e AGENT_MODE="http" \
  -e POLL_INTERVAL_SECS="15" \
```

### 2.3 本地一键联调（开发）

`scripts/dev-e2e.sh` 一键拉起全套本地联调环境（主控 + Web 面板 + Agent + 真实 sing-box 内核）：

```bash
bash scripts/dev-e2e.sh                  # 全套启动并跟踪 Agent 日志，Ctrl+C 退出
SKIP_WEB=1 bash scripts/dev-e2e.sh       # 不启动 Web 面板
NODE_PORT=9443 USE_MASTER_LOCAL=0 bash scripts/dev-e2e.sh # 使用独立联调节点并自定义端口
```

- 脚本每次启动前都会检查并应用数据库迁移，数据库首次创建时再执行种子播种；随后自动完成管理员登录、默认复用 seed 预置的 `Master-Local` 节点、构建并启动 Agent（`SINGBOX_BINARY_PATH` 默认查找 `.tools/sing-box/`）。如需使用独立联调节点，可设置 `USE_MASTER_LOCAL=0`，脚本会按 `127.0.0.1:<NODE_PORT>` 查找或创建节点，并复用或创建对应端口的 VLESS Reality 线路。
- 已在运行的 3000/5173 服务会被复用而非重启；脚本退出只回收其自身启动的进程。
- 若主控进程启动失败，脚本会立即输出 `server.log` 最近 40 行并退出，不再静默等待完整超时；迁移、登录或节点准备阶段失败也会回收本次已启动的主控/Web 进程。
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
4. 装配**主控端自包含发行包**（`pnpm --prod deploy` 生产依赖 + `web-dist/` 面板资源 + `start.sh`/`admin-reset.sh`/`install-agent.sh`/README/.env.example + 版本号 package.json，模板维护在 `scripts/master-bundle/`）；Windows 构建时会清理 workspace 元目录并将包内绝对符号链接改写为相对链接，保证发行包可移动；
5. 打包 tar.gz / zip（Windows 环境无 zip 时自动回退 PowerShell `Compress-Archive`）并生成 `checksums.txt`（SHA-256，含主控端包）；
6. 提取 `CHANGELOG.md` 对应版本小节作为 Release Notes；
7. 通过 `gh` CLI 创建 GitHub Release 并附上全部产物与校验和——**Release 覆盖三端：主控端发行包 + Agent 三平台二进制**。

Tag 已存在则在该提交上构建（要求位于 main 历史上）；不存在则在当前 main HEAD 创建附注 Tag，发布成功后推送。

### 3.3 节点 Agent 升级
节点详情「升级中心」默认从主控 `/api/v1/downloads/binaries/:target` 下载对应架构版本，校验 SHA-256 后执行原子替换；主控不具备对应 Sing-box 架构时，管理员可在面板导入自定义 URL 与 SHA-256 后再下发。Agent 也可通过详情页快捷重启并保留原始启动参数。

### 3.4 主控端升级
下载新版本 `riri-master_*.tar.gz` → 停服 → 解压新包替换目录 → 拷回旧目录的 `.env` 与 `prisma/data/` 数据目录 → `./start.sh`（数据库迁移自动执行，数据与 `.env` 独立于程序目录，升级不丢数据）。

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
