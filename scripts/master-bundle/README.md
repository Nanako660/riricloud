# RiriCloud 主控端（Master）

自包含发行包：内置后端（NestJS）、Web 面板静态资源、Agent 多架构二进制与全部生产依赖，目标机只需 Node.js >= 20。

## 部署三步

```bash
# 1. 解压
tar -xzf riri-master_<version>_linux_amd64.tar.gz && cd riri-master_<version>_linux_amd64

# 2. 准备配置
cp .env.example .env
#   编辑 .env：JWT_SECRET 必填（强随机串，例如 openssl rand -hex 32）

# 3. 启动（首启自动建库与迁移）
./start.sh
```

启动后访问 `http://<host>:<port>` 即为 Web 面板；API 文档在 `/api/docs`。

## 首次登录

初始管理员由 seed 创建（默认 `admin@riricloud.local` / `riri-admin-demo`，可用 `SEED_ADMIN_PASSWORD` 覆盖）。**生产环境登录后立即在「系统设置」中修改默认账号密码策略，并尽快删除演示用户。**

如需播种种子账号：
```bash
node node_modules/prisma/build/index.js db seed
```

## 配置说明（.env）

| 变量 | 必填 | 说明 |
| :--- | :--- | :--- |
| `JWT_SECRET` | 是 | 登录令牌签名密钥，强随机串 |
| `PORT` | 否 | 监听端口，默认 8080 |
| `DATABASE_URL` | 否 | SQLite 路径，默认 `file:./data/riri.db`（相对 prisma 目录） |
| `SEED_ADMIN_EMAIL/PASSWORD` | 否 | 种子管理员凭据（执行 db seed 时使用） |
| `RIRICLOUD_PUBLIC_URL` | 节点远程升级时推荐 | 节点可访问的主控根地址，例如 `https://master.example.com` |
| `RIRICLOUD_BINARY_DIR` | 否 | 内置二进制目录，默认发行包下的 `binaries/` |

## 升级

下载新版本发行包 → 停服 → 解压新包替换本目录 → 把旧目录的 `.env` 与数据文件（`prisma/data/`）拷回 → `./start.sh`（迁移自动执行）。

节点详情的「升级中心」默认使用主控 `binaries/` 目录中的 Agent 多架构版本；管理员可在后台导入并托管自定义 Sing-box 文件。下载端点使用节点 AgentToken 鉴权，不需要节点直接访问 GitHub。

## 运行时说明

- 出厂包在 Linux x64（glibc）上验证；其他平台需自行确认 Prisma 引擎兼容性
- Agent 端程序（`riri-agent_*` 压缩包）部署在节点 VPS 上，见仓库 `docs/DEPLOYMENT_GUIDE.md` §2；主控包内的 `binaries/agent-*` 仅用于远程升级分发。
