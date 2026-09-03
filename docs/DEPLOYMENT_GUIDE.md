# 部署与运维指南 (Deployment & Operations Guide)

## 1. 主控端 (Master) 部署

主控端集成了前端 Web 面板、后端 API、SQLite 数据库与 WebSocket 实时网关。

### 1.1 环境要求
- Node.js >= 20.0.0
- pnpm >= 9.0.0
- Linux / macOS / Windows Server
### 1.2 方式一：自包含发行包部署（推荐）

从 GitHub Release 下载 `riri-master_<version>_linux_amd64.tar.gz`（内置后端、Web 面板静态资源、Linux x64 本机 Agent、Sing-box 与全部生产依赖，目标机只需 Node.js >= 20）：

```bash
tar -xzf riri-master_<version>_linux_amd64.tar.gz && cd riri-master_<version>_linux_amd64
cp .env.example .env   # 编辑：JWT_SECRET、ADMIN_EMAIL、ADMIN_PASSWORD 必填
./start.sh             # 首启自动：生成 Prisma client → migrate deploy → admin/Master-Local bootstrap → 启动 Master + 内置 Agent
```

- 访问 `http://<host>:<port>` 即 Web 面板（生产模式下后端直接托管面板静态资源，非 `/api` 路径自动 SPA 回退）；API 文档 `/api/docs`。
- 首次启动空数据库时，bootstrap 按 `ADMIN_EMAIL`、`ADMIN_PASSWORD` 创建首个管理员；兼容旧配置 `SEED_ADMIN_EMAIL`、`SEED_ADMIN_PASSWORD`，不再提供生产默认管理员密码。
- 生产环境 `AUTO_SEED=false` 时创建管理员、内嵌默认订阅模板和系统保留的 `Master-Local`，不会创建演示用户、套餐和线路；开发/演示环境明确设置 `AUTO_SEED=true` 才会额外执行完整演示 seed。内嵌模板允许管理员通过模板编辑器修改，但不能删除。
- 重置已有管理员密码：`./admin-reset.sh --email admin@example.com`（默认隐藏交互输入）；自动化场景可用 `printf '%s\n' 'new-password' | ./admin-reset.sh --email admin@example.com --password-stdin`。该命令不会创建或提权账号。
- 主控采用双层二进制分发仓：持久运行态仓 `data/binaries/`（支持多架构上传、热更新与缓存，优先级最高）与静态内置仓 `binaries/`（发行包仅精准内置当前宿主架构的本机 Agent 与 Sing-box）。远端不同架构 VPS 节点若需下载安装或升级，可将目标架构文件放入持久卷 `data/binaries/` 或在后台导入。生产环境建议在「系统设置 → 基础与品牌」配置 `publicBaseUrl=https://<master-domain>`；未配置时，节点管理请求会按反向代理的 `X-Forwarded-Proto` 与 `X-Forwarded-Host` 自动匹配当前网站域名，也可设置 `RIRICLOUD_PUBLIC_URL=https://<master-domain>` 作为环境变量兜底。

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

根目录 `pnpm build` 可一次构建三端：Server 输出保留在 `apps/server/dist/`，Web 输出保留在 `apps/web/dist/`，当前平台 Agent 输出到 `artifacts/dev/agent/<os>-<arch>/riri-agent[.exe]`。其中两个 `dist/` 是框架和运行时的约定目录，不与可分发二进制产物混放。

Agent 编译统一由 `scripts/build-agent.sh` 负责：

```bash
pnpm build:agent                                    # 当前平台，开发模式
pnpm build:agent:all                                # Linux/macOS/Windows 五个平台
pnpm build:agent -- --target linux/amd64 --release  # 指定平台，发布模式
```

发布脚本也复用同一入口，发布模式会启用 `-s -w` 去除符号和调试信息；所有构建仍强制 `CGO_ENABLED=0`，并通过 `-ldflags` 注入根 `package.json` 的统一版本号。

### 1.4 方式三：Docker Compose

仓库根目录提供主控 `Dockerfile`、远程节点 `Dockerfile.agent` 与 `docker-compose.yml`。主控镜像已经内置 Linux Agent 和启用 `with_v2ray_api,with_utls,with_quic,with_naive_outbound` 的 Sing-box；`Dockerfile.agent` 仅用于远程 VPS 节点。Docker 构建、镜像导出和 Compose 运行均应在 Linux shell 执行；Windows 开发环境必须使用 WSL，PowerShell/Git Bash 不直接承担 Docker 操作：

```bash
cp .env.example .env  # 或手动创建 .env
# 填写 JWT_SECRET、ADMIN_EMAIL、ADMIN_PASSWORD、MASTER_LOCAL_HOST；生产环境保持 AUTO_SEED=false
pnpm docker:build
pnpm docker:up
```

Windows 开发机可从 PowerShell 调用 WSL，但实际命令必须在 WSL 内执行：

```powershell
wsl.exe -d Ubuntu -- bash -lc "cd /path/to/riricloud && pnpm docker:build"
```

`scripts/docker-build.sh` 会拒绝 `MSYS` / `MINGW` 等原生 Windows shell，并检查 Docker daemon 是否为 Linux containers。`pnpm docker:tags` 只输出当前版本对应的完整镜像标签，不需要连接 Docker daemon。

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

同一次构建默认还会把镜像导出到 `artifacts/docker/v<version>/<os>-<arch>/`：

```text
artifacts/docker/v<version>/linux-amd64/riricloud-master_<version>_linux_amd64.tar.gz
artifacts/docker/v<version>/linux-amd64/riricloud-agent_<version>_linux_amd64.tar.gz
artifacts/docker/v<version>/linux-amd64/riricloud-docker-images_<version>_linux_amd64.manifest.json
artifacts/docker/v<version>/linux-amd64/riricloud-docker-images_<version>_linux_amd64.sha256
```

导出包内同时保留版本标签和 `latest` 标签；manifest 记录组件、标签、平台、Sing-box 版本、OCI 元数据和 SHA-256。只导出现有镜像可执行 `pnpm docker:export`，查看本次构建的完整标签可执行 `pnpm docker:tags`。导出目录可通过 `DOCKER_EXPORT_DIR=/path/to/output` 覆盖，构建但不导出可使用 `DOCKER_EXPORT=false pnpm docker:build`。

运行时镜像使用 Distroless 基础镜像。以 2026-08-31 在 WSL Ubuntu 构建的 `linux/amd64` 结果为参考，Master 镜像约 `376 MB`、压缩导出包约 `87 MB`；Agent 镜像约 `155 MB`、压缩导出包约 `38 MB`。Master 的 Prisma Client 在构建阶段生成，并清理非 SQLite 运行时文件；Agent 的主要体积来自内置的 sing-box，实际体积会随平台和上游基础镜像更新略有变化。

主控容器监听容器内 `3000` 端口，内置 Agent 与 Sing-box 使用同一容器运行，SQLite 数据通过宿主机绑定路径 `${MASTER_DATA_PATH:-./data}:/app/data` 持久化；同时镜像出厂默认将当前宿主架构的 `agent-linux-<arch>`、`singbox-linux-<arch>` 及 `libcronet.so` 内置于 `/app/binaries/`（静态分发基线仓），即便宿主机挂载空白 data 目录，主控也能开箱即用对外提供同平台 Agent 与定制 Sing-box 的下载与升级分发。启动入口自动执行 `migrate deploy`、管理员 bootstrap 和 `Master-Local` bootstrap，只有 `AUTO_SEED=true` 才幂等播种演示数据（默认 `false`）。内置 Agent 由入口显式使用 `riri-agent run` 守护进程子命令启动，不会因继承容器终端而进入 Bubble Tea TUI。容器内显式重置命令为：

```bash
docker compose exec master /nodejs/bin/node /app/prisma/admin-reset.js --email admin@example.com
printf '%s\n' 'new-password' | docker compose exec -T master /nodejs/bin/node /app/prisma/admin-reset.js --email admin@example.com --password-stdin
```

Compose 在 Linux/WSL 下使用 `network_mode: host`，`MASTER_PORT` 同时控制 Master 面板监听端口；本机 Agent 动态使用的 TCP/UDP 线路端口会直接监听宿主机，不需要映射上万条端口。Compose 不固定 `container_name`，可用项目名同时运行多个实例。生产环境应设置 `MASTER_LOCAL_HOST`，或设置 `RIRICLOUD_PUBLIC_URL` 让 bootstrap 自动推导本机线路对外地址。Compose 默认引用 `latest`，`pnpm docker:up` 会注入当前版本和 Git 构建元数据。

Master 启动后会自动为 SQLite 数据库设置 `journal_mode=WAL` 与 `busy_timeout=10000`。数据库目录必须使用支持可靠文件锁的本地持久化卷；如果启动日志出现 `SQLite runtime tuning failed`，应检查挂载目录权限、文件系统类型和是否存在其他进程同时打开同一数据库文件。不要让多个 Master 实例共享同一个 SQLite 文件。

导入离线镜像时，在目标 Docker 环境执行：

```bash
gzip -dc artifacts/docker/v<version>/linux-amd64/riricloud-master_<version>_linux_amd64.tar.gz | docker load
# 只有需要在同一 Compose 中联调远程 Agent 时，才额外加载 Agent 镜像
# gzip -dc artifacts/docker/v<version>/linux-amd64/riricloud-agent_<version>_linux_amd64.tar.gz | docker load
(cd artifacts/docker/v<version>/linux-amd64 && sha256sum -c riricloud-docker-images_<version>_linux_amd64.sha256)
```

仓库另提供 `docker-compose.image.yml` 与 `.env.image.example`，用于直接运行已经导入的镜像。该模板不包含 `build` 配置，并设置 `pull_policy: never`，适合离线或受限网络环境：

```bash
cp .env.image.example .env.image
# 编辑 .env.image：确认镜像标签（如 0.4.5 或 latest）；填写 JWT_SECRET、ADMIN_EMAIL、ADMIN_PASSWORD、MASTER_LOCAL_HOST
docker compose --env-file .env.image -f docker-compose.image.yml up -d --no-build master
docker compose --env-file .env.image -f docker-compose.image.yml ps
```

Master 本机 Agent 会随 `master` 服务自动启动，无需启用独立 Agent profile。只有在同一 Compose 中联调额外远程节点时，才创建节点并取得该远程节点的 AgentToken 后启用 Agent profile：

```bash
docker compose --env-file .env.image -f docker-compose.image.yml --profile agent up -d --no-build
```

该模板与标准 `docker-compose.yml` 使用相同的宿主机绑定路径：Master 为 `${MASTER_DATA_PATH:-./data}:/app/data`，远程 Agent 为 `${AGENT_DATA_PATH:-./data/agent}:/var/lib/riri-agent`。可在 `.env` 或 `.env.image` 中指定绝对路径；相对路径以 Compose 文件所在目录为基准。停止服务使用 `docker compose ... down`，宿主机数据目录不会因停止或删除容器而被删除。

远程节点容器使用 `--network host` 语义，内置静态 `riri-agent` 与启用 `with_v2ray_api,with_utls,with_quic,with_naive_outbound` 构建的 Sing-box `1.14.0`，默认不自动启动以避免空 AgentToken 容器反复重启。Master 本机 Agent 不使用该服务；创建远程节点并取得 Token 后，在 `.env` 中设置 `AGENT_TOKEN`，再执行：

```bash
COMPOSE_PROFILES=agent pnpm docker:up
```

可通过 `AGENT_MASTER_URL`、`AGENT_MODE=http`、`POLL_INTERVAL_SECS` 切换 Agent 的主控地址与 HTTP 轮询模式。停止并清理容器：

```bash
pnpm docker:down
```

### 1.5 Nginx 反向代理与订阅伪静态链接

生产环境建议让 Nginx 作为唯一边缘代理，负责 HTTPS 终止、域名入口、订阅短链 rewrite、WebSocket Upgrade 和限流；Master 只监听内网地址并继续提供标准 API。配置示例位于 `scripts/nginx/riricloud.conf.example`，其中默认上游为 `http://127.0.0.1:3000`。

```bash
sudo cp scripts/nginx/riricloud.conf.example /etc/nginx/conf.d/riricloud.conf
sudo nginx -t
sudo systemctl reload nginx
```

示例默认提供以下行为：

- 严格匹配 `/<UUID>`，内部 rewrite 到 `/api/v1/sub/<UUID>`，不覆盖查询参数；`?type=clash`、`?type=sing-box` 和客户端 `User-Agent` 会继续参与后端格式协商。
- `/ws/agent` 使用 HTTP/1.1 并转发 `Upgrade`、`Connection`，生产 Agent 地址使用 `wss://<domain>/ws/agent`。
- `/api/**`、`/login`、`/admin`、SPA 路由和其他请求继续代理给 Master，不会被短链规则捕获。
- 示例将 `client_max_body_size` 设置为 `2m`，与 Master 的 JSON/表单请求体上限一致；若自定义 Nginx 配置，请保留该值或更大值，否则大模板保存可能在到达 Master 前返回 HTTP `413`。
- 代理统一传递 `Host`、`X-Real-IP`、`X-Forwarded-For`、`X-Forwarded-Proto` 和 `X-Forwarded-Host`。

管理员在「系统设置 → 订阅与分发」开启「使用 Nginx 伪静态短链接」后，用户页面会展示 `https://domain.com/<UUID>`。若 `subscriptionBaseUrl` 设置为 `https://domain.com/panel`，前端会展示 `https://domain.com/panel/<UUID>`，必须同时把示例中的短链 location/rewrite 改成 `/panel/` 前缀。开关只改变展示地址，不会自动检测 Nginx 配置；配置不一致时应先关闭开关或修正 Nginx。

短链只支持 GET 和严格 UUID 单段路径。Token 失效、订阅过期或账号被禁用时，仍由 Master 返回现有 404/403 响应。HTTPS 证书、域名 DNS、访问控制和限流属于 Nginx/部署环境职责。

---

## 2. 节点端 (Edge Node Agent) 部署

### 2.1 方式一：原生 CLI 一键安装（推荐）
在主控面板点击“添加节点”后，复制对应的原生 CLI 命令，登录节点 VPS 终端以 root 身份执行。命令先从主控下载匹配平台的 Agent，再由 Agent 自己完成安装：

```bash
curl -fsSL --location -A 'riri-agent-installer/linux-amd64' \
  'https://<master-domain>/api/v1/downloads/agent?token=<YOUR_AGENT_TOKEN>' \
  -o /tmp/riri-agent && install -m 0755 /tmp/riri-agent /usr/local/bin/riri-agent && \
  rm -f /tmp/riri-agent && \
  /usr/local/bin/riri-agent install --token=<YOUR_AGENT_TOKEN> --master=wss://<master-domain>/ws/agent
```

如果节点所在网络不支持 WebSocket Upgrade，可在安装向导切换为 HTTP 模式：

```bash
curl -fsSL --location -A 'riri-agent-installer/linux-amd64' \
  'https://<master-domain>/api/v1/downloads/agent?token=<YOUR_AGENT_TOKEN>' \
  -o /tmp/riri-agent && install -m 0755 /tmp/riri-agent /usr/local/bin/riri-agent && \
  rm -f /tmp/riri-agent && \
  /usr/local/bin/riri-agent install --token=<YOUR_AGENT_TOKEN> --master=https://<master-domain>
```

#### CLI 安装步骤：
1. User-Agent 使用 `riri-agent-installer/<os>-<arch>` 声明目标平台，例如 `linux-amd64`、`linux-arm64`、`macos-arm64` 或 `windows-amd64`；主控的 `GET /api/v1/downloads/agent` 据此 302 到 Agent 二进制。
2. `riri-agent install` 将 Sing-box 优先从主控 `GET /api/v1/downloads/binaries/singbox-<os>-<arch>` 下载；主控没有该资产时，`--singbox-source auto` 回退到 GitHub Release。
3. 默认写入 `/etc/riri-agent/config.yaml`（权限 `0600`）与 `/var/lib/riri-agent/`，配置包含 Token、Master 地址、通信模式、内核路径和日志路径。
4. 基于 `kardianos/service` 注册并启动开机服务：Linux 使用 systemd/OpenRC/SysVinit，Windows 使用 Windows Service，macOS 使用 Launchd。

常用生命周期命令：

```bash
riri-agent status
riri-agent doctor
riri-agent logs --follow --lines 100
riri-agent restart
riri-agent uninstall --purge --yes
```

> **Agent 环境变量**：`AGENT_TOKEN`、`MASTER_URL`、`AGENT_MODE`、`POLL_INTERVAL_SECS`、`HEARTBEAT_SECS`、`SINGBOX_CONFIG_PATH`、`SINGBOX_BINARY_PATH` 与 `RIRICLOUD_LOG_PATH` 可覆盖 YAML 配置；`MASTER_WS_URL` 继续兼容旧版 Agent。安装后的标准配置路径为 Linux/macOS `/etc/riri-agent/config.yaml`，Windows `%ProgramData%\RiriCloud\config.yaml`。

直接在连接终端中运行 `riri-agent`（不带子命令）会进入 Bubble Tea 全屏控制台 GUI/TUI：使用方向键选择菜单，Enter 执行，Esc 返回，q 退出；安装页提供 AgentToken、Master URL 和通信模式表单，长诊断/日志输出可在结果页滚动查看。脚本、服务管理器、内置 Agent 和无 TTY 环境继续使用上面的一级子命令，不依赖交互输入。

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
- 主控端默认尝试 `http://localhost:3000`；若未检测到可复用的服务且该端口无法绑定（例如 Windows 系统排除端口），脚本会自动向后探测最多 1000 个可用端口，并同步更新主控地址、Web API 代理地址和 Agent WebSocket 地址。可通过 `SERVER_PORT` 或 `PORT` 固定端口，或通过 `SERVER_PORT_SCAN_LIMIT` 调整探测范围。手动启动 Web 时可用 `VITE_API_PROXY_TARGET` 指定 `/api` 代理目标。
- StatsService 默认监听 `127.0.0.1:10085`；若该端口无法绑定，开发联调会自动探测可用端口并通过 `STATS_API_LISTEN` 注入主控配置，Agent 会自动读取下发配置中的 StatsService 地址。也可手动设置 `STATS_API_LISTEN=127.0.0.1:xxxx`。
- 开发联调启动的 Agent 会显式使用非交互模式，避免 Git Bash 后台进程误判为 Bubble Tea 终端并触发无效 console handle 错误。
- 开发联调要求 Sing-box 启用 `with_v2ray_api`、`with_utls`、`with_quic` 和 `with_naive_outbound`。若默认找到的 `.tools/sing-box/` 二进制缺少这些标签，脚本会使用项目内 Go 工具链从 `SINGBOX_VERSION`（默认 `1.14.0`）源码构建并缓存到 `.cache/sing-box-v2ray-api/`；显式设置 `SINGBOX_BINARY_PATH` 时不会自动替换不兼容的二进制。
- 未显式设置 `JWT_SECRET` 时，脚本会为本次本地联调进程生成随机密钥，避免空白开发 `.env` 阻止主控启动；生产环境仍必须按源码部署要求手动配置强随机密钥。
- 已在运行的主控/Web 服务会被复用而非重启；脚本退出只回收其自身启动的主控/Web 进程。若主控端口发生变化，需先停止旧的 5173 Web 进程，再重新执行脚本，使 Vite 重新读取 API 代理目标。
- 若主控进程启动失败，脚本会立即输出 `server.log` 最近 40 行并退出，不再静默等待完整超时；迁移、登录或节点准备阶段失败也会回收本次已启动的主控/Web 进程。
- 可验证的内核行为：配置下发拉起（含 `sing-box check` 预检）、本地 StatsService 监听实际选定地址、面板编辑线路后优雅重启热应用、`taskkill` 内核后自动重拉、关闭 Agent 无残留进程。

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
3. 交叉编译 Agent 多平台产物（`CGO_ENABLED=0` + `-trimpath`，版本号经 `-ldflags` 注入）：`linux/amd64`、`linux/arm64`、`darwin/amd64`、`darwin/arm64`、`windows/amd64`；
4. 使用 `with_v2ray_api,with_utls,with_quic,with_naive_outbound` 构建或校验启用统计服务、VLESS Reality、Hysteria2、TUIC 和 NaiveProxy 出站的 Sing-box，再装配**主控端自包含发行包**（`pnpm --prod deploy` 生产依赖 + `web-dist/` 面板资源 + `start.sh`/`admin-reset.sh`/README/.env.example + 版本号 package.json，模板维护在 `scripts/master-bundle/`）；Windows 构建时会清理 workspace 元目录并将包内绝对符号链接改写为相对链接，保证发行包可移动；
5. 打包 tar.gz / zip（Windows 环境无 zip 时自动回退 PowerShell `Compress-Archive`）并生成 `checksums.txt`（SHA-256，含主控端包）；
6. 提取 `CHANGELOG.md` 对应版本小节作为 Release Notes；
7. 通过 `gh` CLI 创建 GitHub Release 并附上全部产物与校验和——**Release 覆盖主控端发行包 + Agent Linux、macOS、Windows 多平台二进制**。

Tag 已存在则在该提交上构建（要求位于 main 历史上）；不存在则在当前 main HEAD 创建附注 Tag，发布成功后推送。

Release 本地工作目录为 `artifacts/releases/v<version>/`，结构如下：

```text
artifacts/releases/v<version>/
├── agent/<os>-<arch>/       # 未压缩的 Agent 二进制
├── master/linux-amd64/      # 未压缩的主控自包含目录
├── packages/                # tar.gz / zip 可分发包
├── checksums.txt
└── release-notes.md
```

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

---

## 5. 线路编排与中继模式指南 (Lines & Relay Mode Guide)

RiriCloud 采用**以线路（Line）为中心（Line-Centric Pipeline）**的自动化网络编排架构。线路是面向用户订阅的唯一业务实体，直接内聚代理协议、传输层、安全层以及底层节点流转拓扑。管理员无需在节点上逐一手动添加入站，系统会根据线路定义自动向边缘节点下发配对的 Sing-box 配置。

### 5.1 核心概念与拓扑架构

系统支持两种线路模式（`type`）：

- **直连线路 (`DIRECT`)**：单节点接入。入口节点与出口节点为同一台机器，入口端口与出口端口一致，客户端直连落地机出网。
- **中继线路 (`RELAY`)**：跨节点中转级联。将前置**入口节点（Entry Node，如国内优质 BGP / 专线中转 VPS）**与后置**出口节点（Exit Node，如境外落地 VPS）**串联。客户端仅连接入口节点，流量由入口节点在内核态透明中继至出口节点解密出网。

```text
                               【中继模式端到端流量拓扑】
               ┌───────────────────────────┐                    ┌───────────────────────────┐
               │     入口节点 (中转 VPS)     │                    │     出口节点 (落地 VPS)     │
[用户客户端] ───> │  监听: 入口端口 (entryPort) │ ─────────────────> │  监听: 出口监听端口 (exitPort)│ ───> [目标互联网]
 (订阅连接)     │  例: 203.0.113.1:25001    │   (公网转发/代理)   │  例: 198.51.100.2:25002   │      (真实访问)
               └───────────────────────────┘                    └───────────────────────────┘
```

### 5.2 两种中继机制深度对比

在中继线路的高级设置中，支持两种中继机制（`relayMode`）：

| 中继机制 | 底层实现原理 | 优势与限制 | 推荐场景 |
| :--- | :--- | :--- | :--- |
| **盲转发 (`BLIND_FORWARD`)**<br>*四层端口转发* | 入口节点运行 Sing-box `direct` 入站，将收到的原始四层 TCP/UDP 流量原封不动透传至出口节点的公网 IP 与出口监听端口；握手解密完全在出口节点完成。 | **性能最高、延迟最低、系统资源消耗极小**；实现真正的端到端加密，中转机不接触 TLS 私钥与明文流量；支持所有协议（含 VLESS-Reality、ShadowTLS、Hysteria2、TUIC、Trojan 等）。 | **强烈推荐（绝大多数中转场景首选）** |
| **协议代理 (`PROTOCOL_PROXY`)**<br>*协议重加密中继* | 入口节点作为一个完整协议入站终结客户端握手，再由本地内核出站规则（`outbound` + `route`）向出口节点重新握手建连转发。 | 入口与出口分别进行独立协议握手；但中转机需要消耗 CPU 资源进行解密与重封装。受内核架构限制，**不支持 ShadowTLS**。 | 需要入口处完全终结客户端握手的特殊网络拓扑 |

### 5.3 端口机制与传输层协议映射

在中继线路中，核心由两个端口协同工作：

1. **入口端口 (`entryPort`)**：
   - 监听在**入口节点（中转 VPS）**上。
   - 客户端订阅配置中展示并连接的正是该端口（客户端连接 `入口节点公网IP:入口端口`）。
2. **出口监听端口 (`exitPort`)**：
   - 监听在**出口节点（落地 VPS）**上。
   - 出口节点的代理内核（Sing-box）在该端口上启动真实的协议监听，负责接收来自入口节点的流量并解密出网。
3. **端口传输层协议（TCP 还是 UDP？）**：
   - **入口端口与出口监听端口的传输层类型完全跟随整条线路所选的协议类型**，两端永远保持严格一致：
     - **Hysteria 2 / TUIC**：基于 QUIC/UDP，入口端口与出口监听端口**均为 UDP 端口**。
     - **VLESS / Trojan / VMess / ShadowTLS / NaiveProxy**：基于 TCP，入口端口与出口监听端口**均为 TCP 端口**（在这些协议中，用户产生的 UDP 数据包已在协议内层封装并通过该 TCP 隧道传输）。
     - **Shadowsocks**：主要使用 **TCP 端口**（原生 UDP 时复用同端口）。
4. **为什么采用独立端口管道，而非复用已有端口？**
   - **精准计费与倍率隔离**：直连与中继通常倍率不同（如直连 1.0x、中继 1.5x），独立端口使得边缘 Agent 上报的用户流量增量能够 100% 精准归属到对应线路并按倍率扣费。
   - **生命周期解耦**：管理员增删改查、启用或停用某条线路时，不会对其他线路产生意外连锁影响。
   - **独立健康熔断**：中转机离线时系统自动仅将该中继线路标记为不可用并从订阅剔除，落地机上的直连线路仍能继续服务。
   - **极低资源开销**：现代 Linux 与 Sing-box 多监听一个空闲端口仅占用数十 KB 内存，无额外 CPU 开销，且让端口级排错极为清晰。

### 5.4 管理端配置实操流程

1. **前置准备**：确保在管理后台「节点管理」中至少有两个处于 **在线 (`ONLINE`)** 状态的节点（如国内中转 VPS 与境外落地 VPS）。
2. **新建线路**：进入 **「线路管理」**（`/admin/lines`），点击右上角 **「新建线路」**。
3. **「基础与网络」配置**：
   - 输入**线路名称**（如 `沪日专线 · 东京 [中继]`）。
   - 选择**协议类型**（如 `VLESS`、`HYSTERIA2` 等）。
   - **入口节点**：选择中转 VPS。
   - **入口监听端口**：填入目标端口，或**直接留空让系统在 20000~29999 范围自动分配**。
   - 按需配置传输层（WS/gRPC/TCP）与安全层（Reality 公私钥/TLS 证书）。
4. **「高级与覆盖设置」配置拓扑**：
   - 切换到 **「高级与覆盖设置」** 页签。
   - **线路模式**：切换为 **`中继` (`RELAY`)**。
   - **出口节点**：选择落地 VPS。
   - **出口监听端口**：填入落地机监听端口，或**直接留空自动分配**。
   - **中继机制**：选择 **`盲转发：保持端到端协议`**（推荐）。
   - **对外端点覆盖（可选）**：若入口节点前端配置了 DDNS 域名、弹性公网 IP 或 NAT 端口映射，可开启覆盖开关并填写对外域名与端口。
   - 设置流量倍率（如 `1.5`）、标签与启用状态。
5. **保存生效**：
   - 点击 **「保存」**。主控系统将在 250ms 内通过 WSS 向入口与出口节点自动下发 `config_sync`，Sing-box 热加载就绪。

### 5.5 云防火墙与网络排错建议

1. **云厂商安全组放行策略（强烈推荐）**：
   - RiriCloud 默认端口分配范围为 **`20000 ~ 29999`**。
   - 建议在云厂商控制台（阿里云、腾讯云、AWS、Oracle Cloud 等）为中转机和落地机配置安全组放行规则：
     - **协议**：`TCP/UDP`
     - **端口范围**：`20000-30000`
   - 这样新增或调整中继线路时无需频繁手动修改云安全组。
2. **双机在线门禁机制**：
   - 中继线路要求**入口节点与出口节点同时处于在线 (`ONLINE`) 状态**才会向普通用户生成订阅并允许连通。若任一节点下线，系统会自动屏蔽该中继线路以防客户端产生死链。
3. **连通性排查指令**：
   - 在中转机上测试能否正常连通落地机的出口监听端口：
     ```bash
     # TCP 协议测试 (VLESS / Trojan / Shadowsocks 等)
     nc -zv <exit-node-ip> <exit-port>
     # 或使用 curl
     curl -v telnet://<exit-node-ip>:<exit-port>
     ```
   - 在落地机上确认 Sing-box 正在监听对应端口：
     ```bash
     ss -tulpn | grep <exit-port>
     ```

### 5.6 常见疑问与进阶拓扑 (FAQ)

- **Q: 能否实现 3 个及以上节点的多级跳中转（A -> B -> C）？**
  - 当前 RiriCloud 原生支持两节点中继（入口 -> 出口）。如需三跳（如 国内 A -> 香港 B -> 日本 C），最简便高效的方案是在中间机 B 上通过系统级端口转发工具（如 `realm`、`gost` 或 `iptables`）将 B 的端口直接转给 C 的出口监听端口；在 RiriCloud 后台只需纳管 A -> B 的中继即可。
- **Q: 为什么出口监听端口不能直接填已有直连线路的端口？**
  - 为了保证流量倍率计费准确性与线路生命周期解耦，每条线路享有独立的端口通道。多开端口在 Linux 下资源占用可忽略不计，且能带来故障隔离的运维优势。
- **Q: ShadowTLS 为什么不能选协议代理？**
  - ShadowTLS 依赖独特的握手验证与内层 Shadowsocks 端口协同，目前仅支持直连模式与盲转发模式。
