# 项目全局硬约束 (Project Constraints)

本文档定义 **RiriCloud** 的不可协商红线。任何 PR（含 AI 代理的自动变更）触碰以下约束即为打回项；需要突破红线时，唯一途径是先提 RFC 修订本文档。分层架构与代码组织规则见 [CODE_REVIEW.md](./CODE_REVIEW.md)。

---

## 1. 技术栈锁定

以下选型为项目基石（选型依据见 [TECH_STACK.md](./TECH_STACK.md)），**更换任一项属于 MAJOR 级决策**：必须先更新本文档与 [TECH_STACK.md](./TECH_STACK.md)、[VERSIONING.md](./VERSIONING.md) 中的相关章节，再动代码。

| 领域 | 锁定选型 |
| :--- | :--- |
| 包管理 / 工程结构 | pnpm Workspace (Monorepo) |
| 前端 | React + TypeScript + Vite + Tailwind CSS + shadcn/ui |
| 主控后端 | NestJS + TypeScript |
| 持久化 | SQLite (WAL) + Prisma ORM |
| 实时通信 | `@nestjs/websockets` + `ws`（WSS） |
| 边缘节点 | Go ≥ 1.22（`CGO_ENABLED=0` 单静态二进制） |
| 代理内核 | Sing-box |
| Node.js / pnpm 版本 | Node ≥ 20，pnpm ≥ 9 |

在既有选型内新增**小型**辅助库不受限，但须遵守 [CODE_REVIEW.md](./CODE_REVIEW.md) §4 的依赖说明义务。

---

## 2. 零外部服务依赖红线

系统整体（主控端）**开箱即用，不依赖任何外部数据库或中间件**：

1. **禁止引入** MySQL / PostgreSQL / MongoDB / Redis / RabbitMQ / Kafka / etcd 等任何外部服务客户端依赖。
2. 需要缓存 → 进程内缓存；需要队列 → 进程内异步任务；需要锁 → SQLite 事务。**先证明当前方案不够用，再讨论突破**（此时走 RFC，且大概率意味着架构文档重写）。
3. 部署形态承诺不变：主控端单进程 + 单 SQLite 文件（`docker-compose.yml` 不得出现数据库/缓存服务条目）。

---

## 3. 资源约束（边缘节点）

Agent 面向最低配 VPS 运行，资源预算是验收指标而非建议：

| 指标 | 上限 |
| :--- | :--- |
| Agent 常驻内存（不含 Sing-box 内核） | ≤ 30 MB |
| 目标运行环境 | 256 MB 内存 / 1 核 VPS 可正常工作 |
| 二进制体积 | ≤ 25 MB（gzip 后） |
| 启动到 WSS 连接建立 | ≤ 5 秒（正常网络） |

新依赖引入后必须复核上述指标；遥测采集频率默认 5~10 秒，不得为省事提高到秒级以下。

---

## 4. 安全红线

1. **凭据管理**：JWT 密钥、AgentToken、Reality 私钥一律经环境变量或安全分发注入；**禁止**硬编码、入 git、入日志。
2. **传输加密**：生产环境 Master 面板强制 HTTPS、Agent 通道强制 WSS；开发环境可降级为本地 ws/http，但代码不得内置"生产关闭 TLS"的开关。
3. **密码存储**：`bcrypt`（成本因子 ≥ 10），禁止 MD5/SHA1/明文；禁止可逆加密存密码。
4. **鉴权默认拒绝**：所有 API 默认挂 JWT Guard，公开端点须显式 `@Public()` 声明并逐一登记；Agent 鉴权失败必须断开连接。
5. **输入校验**：服务端对一切外部输入（HTTP / WS / 订阅 token）校验后才使用（详见 [CODE_REVIEW.md](./CODE_REVIEW.md) §5）。
6. **日志脱敏**：`passwordHash`、`agentToken`、`uuid`（用户凭证）不得以任何级别输出到日志。
7. **依赖安全**：CI 中运行 `pnpm audit` 与 `govulncheck`，高危漏洞阻断合并。

---

## 5. 文档同步约束

**代码与文档不一致视为 bug。** 修改以下内容时，对应文档必须在**同一个 PR** 内更新：

| 你改了什么 | 必须同步更新 |
| :--- | :--- |
| REST API 端点、WS 消息、订阅输出格式 | [API_AND_PROTOCOLS.md](./API_AND_PROTOCOLS.md) |
| Prisma 模型、字段、索引 | [DATA_MODELS.md](./DATA_MODELS.md) |
| 组件拓扑、通信链路、时序 | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| 选型、依赖库 | [TECH_STACK.md](./TECH_STACK.md) |
| 部署方式、安装脚本行为 | [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) |
| 工程规范、红线 | 本文档 / [VERSIONING.md](./VERSIONING.md) / [GIT_WORKFLOW.md](./GIT_WORKFLOW.md) / [CODE_REVIEW.md](./CODE_REVIEW.md) |
| 里程碑进度 | [ROADMAP.md](./ROADMAP.md)（完成的条目打勾） |

`feat` / `fix` 类变更还须在 [CHANGELOG.md](../CHANGELOG.md) 的 `[Unreleased]` 追加条目（详见 [VERSIONING.md](./VERSIONING.md) §5）。

---

## 6. 语言与命名约定

| 场景 | 语言 |
| :--- | :--- |
| 代码标识符（变量/函数/类型/包名） | 英文 |
| 日志消息 | 英文（节点日志可能被任意语言环境的运维检索） |
| 代码注释 | 中文，解释"为什么"而非复述代码 |
| commit 描述、PR 描述、CHANGELOG 条目 | 中文（type 用英文，见 [GIT_WORKFLOW.md](./GIT_WORKFLOW.md) §3） |
| 文档库 | 中文 |
| 用户可见的 UI 文案 | 中文 |

命名风格沿用各语言生态惯例：TS 用 `camelCase` / `PascalCase`，Prisma model 用 `PascalCase` + 字段 `camelCase`，Go 用 `camelCase` / `PascalCase`（导出）。

---

## 7. 其他工程红线

1. **测试策略**：业务逻辑（配额扣减、订阅生成、权限判定）单元测试必写；WS 协议与流量核算保留端到端联调用例（Phase 5 落地）。不追求行覆盖率数字，但修 bug 必须先有复现测试。
2. **迁移安全**：Prisma 迁移一旦合入 main 不得修改历史迁移文件，只能追加新迁移。
3. **配置管理**：所有可配置项集中一处定义（server：`@nestjs/config` + `.env`；agent：`/etc/riri-agent/config.yaml` + 环境变量），禁止散落的魔法常量。
4. **禁止"临时"绕行**：禁用门禁、跳过校验、`// TODO 稍后处理` 式的安全空缺，一律不允许进 main。
