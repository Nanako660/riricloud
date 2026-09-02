# RiriCloud 主控端（Master）

自包含发行包：内置后端（NestJS）、Web 面板静态资源、Linux x64 本机 Agent、Sing-box 与全部生产依赖，目标机只需 Node.js >= 20。

## 部署三步

```bash
# 1. 解压
tar -xzf riri-master_<version>_linux_amd64.tar.gz && cd riri-master_<version>_linux_amd64

# 2. 准备配置
cp .env.example .env
#   编辑 .env：JWT_SECRET、ADMIN_EMAIL、ADMIN_PASSWORD 必填

# 3. 启动（首启自动建库与迁移）
./start.sh
```

启动后访问 `http://<host>:<port>` 即为 Web 面板；API 文档在 `/api/docs`，节点 Agent 可通过面板生成的原生 CLI 命令安装。

## 首次登录

首次启动空数据库时，bootstrap 会根据 `ADMIN_EMAIL`、`ADMIN_PASSWORD` 创建首个管理员。兼容旧配置 `SEED_ADMIN_EMAIL`、`SEED_ADMIN_PASSWORD`，但不再提供生产默认凭据。

生产环境默认 `AUTO_SEED=false`，初始化管理员、内嵌默认订阅模板和不可删除的 `Master-Local`，不创建演示用户、套餐和线路。内嵌模板允许管理员修改但不能删除。开发或演示环境明确设置 `AUTO_SEED=true` 后，才会额外执行完整 seed：
```bash
AUTO_SEED=true ./start.sh
```

如需重置已有管理员密码，命令默认隐藏交互输入并要求确认：
```bash
./admin-reset.sh --email admin@example.com
printf '%s\n' 'new-password' | ./admin-reset.sh --email admin@example.com --password-stdin
```
重置命令不会创建账号，也不会把普通用户提权为管理员。

## 配置说明（.env）

| 变量 | 必填 | 说明 |
| :--- | :--- | :--- |
| `JWT_SECRET` | 是 | 登录令牌签名密钥，强随机串 |
| `PORT` | 否 | 监听端口，默认 8080 |
| `DATABASE_URL` | 否 | SQLite 路径，默认 `file:./data/riri.db`（相对 `prisma/` 目录） |
| `AUTO_SEED` | 否 | 是否在每次启动时幂等执行完整演示 seed，默认 `false`；`Master-Local` 不受该开关影响 |
| `MASTER_AGENT_ENABLED` | 否 | 是否启动发行包内置本机 Agent，默认 `true`；关闭后系统节点保持离线 |
| `MASTER_LOCAL_HOST` | 推荐 | 本机线路对外公布的主机名/IP；未填写时从 `RIRICLOUD_PUBLIC_URL` 推导 |
| `ADMIN_EMAIL/PASSWORD` | 首次启动必填 | 首个管理员凭据；已有管理员不会被环境变量覆盖 |
| `SEED_ADMIN_EMAIL/PASSWORD` | 否 | 兼容旧配置，仅在对应 `ADMIN_*` 未填写时使用 |
| `RIRICLOUD_PUBLIC_URL` | 推荐 | 节点可访问的主控根地址，例如 `https://master.example.com`，也用于推导本机线路地址 |
| `RIRICLOUD_BINARY_DIR` | 否 | 内置二进制目录，默认发行包下的 `binaries/` |

## 升级

下载新版本发行包 → 停服 → 解压新包替换本目录 → 把旧目录的 `.env` 与 `prisma/data/` 拷回 → `./start.sh`（迁移自动执行）。

主控支持双层二进制分发仓：持久仓 `data/binaries/`（可挂载持久卷，支持后台导入与热更新）与内置仓 `binaries/`。节点详情的「升级中心」优先使用主控分发仓中的架构版本；管理员也可在后台导入并托管自定义 Sing-box 文件。下载端点使用节点 AgentToken 鉴权，不需要节点直接访问 GitHub。

## 运行时说明

- 出厂包在 Linux x64（glibc）上验证；其他平台需自行确认 Prisma 引擎兼容性
- 主控包内 `binaries/agent-linux-amd64` 与 `binaries/singbox-linux-amd64` 由 `start.sh` 默认启动为本机 Agent，仅精准包含匹配当前宿主架构的二进制；其他架构资产用于远程节点升级时可通过 `data/binaries/` 挂载或管理端按需导入。远程 Agent 仍可按仓库 `docs/DEPLOYMENT_GUIDE.md` §2 独立部署。
