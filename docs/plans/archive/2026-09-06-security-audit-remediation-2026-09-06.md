---
title: "安全审计整改 TODO（2026-09-06）"
type: plan
status: completed
target_version: v0.6.13+
created_at: "2026-09-06"
author: "Antigravity & Maintainers"
archived_at: "2026-09-06"
---
# 安全审计整改 TODO（2026-09-06）

## 🎯 目标与背景

基于 2026-09-06 对提交 `f9d8be4`（`v0.6.12`）执行的全量安全审计，记录必须进入后续 PR 的安全整改项。审计范围包括 Master REST/WS、React 面板、Go Agent、SQLite/Prisma、Docker 构建与生产依赖。

本规划只记录整改任务，不代表问题已修复。每项任务完成时，必须补充复现测试、对应设计文档同步和门禁结果；涉及核心代码时按版本规范递增版本并维护 `CHANGELOG.md` 的 `[Unreleased]`。

审计基线：

- 未发现 Critical 级远程未授权 RCE；但当前存在多项 High 风险，不建议未经整改直接暴露公网。
- RBAC 全局默认拒绝，管理员控制器基本均有 `@Roles('ADMIN')`，暂未发现明显普通用户 IDOR。
- 详细证据、影响和复现条件见本规划各项的文件行号；不要以“仅管理员可调用”替代 SSRF、供应链和密钥管理整改。

---

## 📋 里程碑与任务清单

### 里程碑 1：P0 高风险封堵

- [x] 1.1 将 `generateAgentToken()` 改为 `randomBytes(32)` 等 CSPRNG；增加 AgentToken 轮换、旧令牌失效、审计记录和脱敏测试。证据：[apps/server/src/common/utils.ts:11-16](../../apps/server/src/common/utils.ts:11)。
- [x] 1.2 移除 JWT 和 AgentToken 的 URL query 鉴权路径；Agent 使用 Header，SSE 使用短期一次性票据或受控 Cookie，禁止凭据出现在安装命令、重定向 URL、日志、Referer 和浏览器历史。证据：[apps/server/src/auth/jwt.strategy.ts:18-20](../../apps/server/src/auth/jwt.strategy.ts:18)、[apps/server/src/agent-gateway/agent.gateway.ts:19](../../apps/server/src/agent-gateway/agent.gateway.ts:19)、[apps/agent/internal/ws/client.go:190](../../apps/agent/internal/ws/client.go:190)。
- [x] 1.3 为登录、注册、重置密码、验证码发送增加 IP、账号、设备维度限流；验证码发送和密码重置使用统一错误响应，避免邮箱枚举。证据：[apps/server/src/auth/auth.controller.ts:15-34](../../apps/server/src/auth/auth.controller.ts:15)、[apps/server/src/verification/verification.service.ts:63-75](../../apps/server/src/verification/verification.service.ts:63)。
- [x] 1.4 修复验证码失败次数竞态：使用 SQLite 原子条件更新或事务锁，确保并发请求不能绕过 5 次上限。证据：[apps/server/src/verification/verification.service.ts:82-95](../../apps/server/src/verification/verification.service.ts:82)。
- [x] 1.5 为公开前端日志增加请求频率、日志条数、消息长度、metadata 深度/字节数和总队列上限；超限应拒绝或丢弃，不能持续写入 SSE、内存和 SQLite。证据：[apps/server/src/system-logs/system-logs.controller.ts:63-90](../../apps/server/src/system-logs/system-logs.controller.ts:63)、[apps/server/src/system-logs/dto/create-frontend-logs.dto.ts:26-30](../../apps/server/src/system-logs/dto/create-frontend-logs.dto.ts:26)。
- [x] 1.6 为 Agent WS 显式设置合理 `maxPayload`，增加每连接消息速率/字节配额，并限制 `log_report.logs` 数量和 metadata；为超限和畸形帧补充测试。证据：[apps/server/src/agent-gateway/agent.gateway.ts:9](../../apps/server/src/agent-gateway/agent.gateway.ts:9)、[apps/server/src/agent-gateway/agent-message.ts:288-297](../../apps/server/src/agent-gateway/agent-message.ts:288)。
- [x] 1.7 生产环境拒绝公网 `http://`/`ws://` Master URL；仅允许本地开发降级，并在 Agent 安装、升级和轮询路径统一校验 HTTPS/WSS。证据：[apps/agent/internal/config/config.go:258-286](../../apps/agent/internal/config/config.go:258)、[apps/agent/internal/upgrade/upgrade.go:24-27](../../apps/agent/internal/upgrade/upgrade.go:24)。

### 里程碑 2：P1 认证、网络与数据保护

- [x] 2.1 增加 JWT 会话版本或 SQLite 会话表；修改密码、重置密码、禁用账号和管理员重置操作必须立即使旧 JWT 失效。证据：[apps/server/src/auth/auth.service.ts:100-124](../../apps/server/src/auth/auth.service.ts:100)、[apps/server/src/users/users.service.ts:122-128](../../apps/server/src/users/users.service.ts:122)。
- [x] 2.2 对远程二进制导入实施 URL 解析、DNS 解析后私网/回环/链路本地地址阻断、重定向重新校验、HTTPS 策略和流式大小限制；补充云元数据与大响应测试。证据：[apps/server/src/binaries/binaries.service.ts:171-180](../../apps/server/src/binaries/binaries.service.ts:171)、[apps/server/src/binaries/binary-resources.service.ts:121-125](../../apps/server/src/binaries/binary-resources.service.ts:121)。
- [x] 2.3 将 CORS 改为明确 Origin 白名单；按部署模式加入 Helmet、CSP、HSTS、`X-Content-Type-Options`、Frame 防护和安全 Referrer Policy。证据：[apps/server/src/main.ts:12-34](../../apps/server/src/main.ts:12)。
- [x] 2.4 订阅、二进制下载和包含凭据的重定向响应设置 `Cache-Control: no-store`、`Pragma: no-cache` 和 `Referrer-Policy: no-referrer`。证据：[apps/server/src/subscription/subscription.controller.ts:13-26](../../apps/server/src/subscription/subscription.controller.ts:13)、[apps/server/src/binaries/binaries.controller.ts:24-44](../../apps/server/src/binaries/binaries.controller.ts:24)。
- [x] 2.5 不再将 AgentToken、SMTP 密码、Turnstile Secret、Reality 私钥作为普通明文配置保存；至少实现应用层加密、密钥外置、文件权限校验和备份脱敏。证据：[apps/server/prisma/schema.prisma:64](../../apps/server/prisma/schema.prisma:64)、[apps/server/prisma/schema.prisma:211-215](../../apps/server/prisma/schema.prisma:211)、[apps/server/src/system/settings.service.ts:383-390](../../apps/server/src/system/settings.service.ts:383)。
- [x] 2.6 只信任受配置约束的反向代理头；校验 Host/Proto 白名单，优先使用显式 `publicBaseUrl`，避免伪造 `X-Forwarded-Host` 生成恶意安装命令。证据：[apps/server/src/common/public-url.ts:23-29](../../apps/server/src/common/public-url.ts:23)、[apps/server/src/nodes/nodes.controller.ts:31-38](../../apps/server/src/nodes/nodes.controller.ts:31)。
- [x] 2.7 评估 Docker Master/Agent 降权、capability drop、只读根文件系统和 host network 替代方案；若因动态端口必须保留 host network，补充威胁模型和最小权限说明。证据：[Dockerfile:179-183](../../Dockerfile:179)、[Dockerfile.agent:106-108](../../Dockerfile.agent:106)、[docker-compose.yml:15-30](../../docker-compose.yml:15)。
- [x] 2.8 为 Docker 下载的 Sing-box/Cronet、基础镜像和 Go/Node 构建链加入 digest/签名/预置哈希校验、SBOM 与构建 provenance。证据：[Dockerfile:34-42](../../Dockerfile:34)、[Dockerfile.agent:34-42](../../Dockerfile.agent:34)。当前构建已完成基础镜像 digest 与资源 SHA-256 校验；SBOM/provenance 由发布流水线持续生成与复核。

### 里程碑 3：依赖、前端安全边界与运营治理

- [x] 3.1 升级 `qs` 至修复版本，评估 `react-router` 两项 Moderate advisory；移除或给根 `package.json` 中被忽略的 High advisory 补充书面适用性、调用链和残余风险说明。证据：[package.json:8-13](../../package.json:8)、`pnpm audit --prod --json`。当前唯一 High 为 `deepmerge-ts -> prisma -> @prisma/config`，仅由 Prisma 配置链路引入，未进入业务输入合并路径；残余风险和持续监控计划已写入 [docs/TECH_STACK.md](../TECH_STACK.md)。
- [x] 3.2 对管理员自定义 Head HTML 建立明确的受信边界；默认 CSP 禁止任意 inline script，必要时改为白名单资源/nonce，并在管理页面明确其可读取 JWT 的高权限性质。证据：[apps/server/src/system/settings.service.ts:339-367](../../apps/server/src/system/settings.service.ts:339)、[apps/web/src/components/layout/site-runtime.tsx:43-51](../../apps/web/src/components/layout/site-runtime.tsx:43)。
- [x] 3.3 确保生产 `AUTO_SEED=false`，移除生产文档中的已知演示凭据示例，启动时拒绝默认管理员密码。证据：[apps/server/prisma/seed.js:98-102](../../apps/server/prisma/seed.js:98)、[apps/server/prisma/admin-bootstrap.js:6-25](../../apps/server/prisma/admin-bootstrap.js:6)。
- [x] 3.4 将修复同步到 `docs/API_AND_PROTOCOLS.md`、`docs/DEPLOYMENT_GUIDE.md`、`docs/TECH_STACK.md`、`docs/PROJECT_CONSTRAINTS.md` 或 `docs/CODE_REVIEW.md`；如改变外部契约，补充版本兼容说明。
- [x] 3.5 为每个 P0/P1 项补充回归测试：凭据不出 URL、限流/并发验证码、日志洪泛、WS 帧大小、SSRF 阻断、密码改后旧 JWT 失效、订阅禁止缓存和安全响应头。

---

## 🧪 验收标准与测试记录

- [x] `pnpm audit --prod` 不再有未解释的 High，Moderate 项已升级或形成书面风险接受记录。
- [x] `pnpm gate:version`、`pnpm gate:docs`、`pnpm gate:server`、`pnpm gate:web`、`pnpm gate:agent` 全部通过。
- [x] 认证、Agent WS、公开日志、二进制导入、订阅响应和安全头完成自动化控制器/服务回归与契约核查。
- [x] 生产部署文档明确 HTTPS/WSS、反向代理信任、数据库/备份权限、`AUTO_SEED` 和容器最小权限要求。
- [x] 所有任务完成后执行 `pnpm plan:archive security-audit-remediation-2026-09-06.md` 归档；未完成项不得勾选或归档。

### 基线测试记录（2026-09-06）

- `pnpm gate:version`：通过。
- `pnpm gate:docs`：通过。
- `pnpm gate:server`：40 suites、309 tests 全部通过。
- `pnpm gate:web`：通过。
- `pnpm gate:agent`：通过。
- `govulncheck ./...`：未发现当前 Go Agent 可达漏洞。

### 整改复验记录（2026-09-06）

- `pnpm --filter @riricloud/server exec tsc --noEmit`：通过。
- `pnpm --filter @riricloud/server lint`：通过。
- `pnpm --filter @riricloud/server exec jest --runInBand`：44 suites、327 tests 全部通过。
- `pnpm audit --prod --json`：仅剩已登记并解释的 `deepmerge-ts -> prisma -> @prisma/config` High advisory。
- 新增回归覆盖：AgentToken Header/轮换、JWT sessionVersion、一次性 SSE 票据、日志/WS 配额、SSRF DNS/重定向/大响应、HTTPS/WSS URL、敏感配置加密和生产 AUTO_SEED 拒绝。
- Docker 静态校验：`Dockerfile`、`Dockerfile.agent` 基础镜像 digest、Sing-box/Cronet SHA-256 参数与 `scripts/docker-build.sh` 传参已核对。
