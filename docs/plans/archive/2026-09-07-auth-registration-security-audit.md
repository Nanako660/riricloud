---
title: "用户登录注册系统全量安全审计整改 TODO（2026-09-07）"
type: plan
status: completed
target_version: v0.6.13+
created_at: "2026-09-07"
author: "Codex & Maintainers"
archived_at: "2026-09-07"
---
# 用户登录注册系统全量安全审计整改 TODO（2026-09-07）

## 目标与背景

本规划记录 2026-09-07 对 Master 用户登录、注册、邮箱验证码、找回密码、个人密码修改、管理员用户操作及前端认证凭据生命周期执行全量审计后发现的整改项，重点关注注册入口及其依赖的人机验证、邮箱验证和反滥用边界。

本规划记录的整改项已在当前特性分支完成。每项任务均补充了复现/回归测试，并同步更新受影响的 API、数据模型、约束、部署或前端安全文档；核心代码变更已记录在 `CHANGELOG.md` 的 `[Unreleased]`，根版本号保持不变。

审计边界：

- Master REST 认证与用户接口、邮箱验证码服务、CAPTCHA/Turnstile 集成、JWT 会话、管理员密码重置脚本。
- Prisma 用户/验证码/会话相关模型与 SQLite 并发行为。
- React 登录/注册/找回密码流程及浏览器端认证凭据保存。
- 认证接口的输入约束、错误语义、缓存策略、限流和 e2e 回归覆盖。

## 风险摘要

### P1：需要优先封堵

- 本地图形验证码答案被放入 Base64 payload，客户端可直接解码，注册 CAPTCHA 可被绕过。证据：[apps/server/src/captcha/captcha.service.ts](../../apps/server/src/captcha/captcha.service.ts)。
- 管理员 CLI 重置密码未递增 `sessionVersion`，目标账号已有 JWT 在重置后仍可能继续有效。证据：[apps/server/prisma/admin-reset.js](../../apps/server/prisma/admin-reset.js)。
- 邮箱验证码以明文写入数据库，数据库读取权限泄露时可直接复用验证码。证据：[apps/server/prisma/schema.prisma](../../apps/server/prisma/schema.prisma)、[apps/server/src/verification/verification.service.ts](../../apps/server/src/verification/verification.service.ts)。
- 默认 CSP 未完整允许 Cloudflare Turnstile 所需的脚本、iframe 和网络请求，启用 Turnstile 后注册流程可能无法正常工作。证据：[apps/server/src/main.ts](../../apps/server/src/main.ts)。

### P2：需要在同一整改周期处理

- 注册、找回密码、用户改密和管理员改密对密码最小长度的读取方式不一致，动态 `passwordMinLength` 可能被部分入口绕过。
- 注册已存在邮箱、找回密码未知邮箱、登录禁用账号的错误语义不同，存在邮箱/账号枚举信号。
- 登录、注册存在性查询和管理员创建用户对邮箱大小写的归一化不一致，可能造成重复账号、冲突或认证异常。
- 注册调用 CAPTCHA 校验时未传入 `remoteIp`，IP 维度限流会退化到 `unknown`，降低反滥用效果。
- 认证限流使用单进程内存 `Map`，重启或多实例部署可绕过，且缺少总键数量上限，存在内存增长风险。

### 补充硬化项

- 认证响应未统一显式设置 `Cache-Control: no-store` 等禁止缓存头。
- 邮箱 DTO 缺少统一最大长度约束，长输入会增加校验、日志和数据库压力。
- Turnstile 校验未强制核对 `action` 与 `hostname`，服务端接受范围偏宽。
- JWT 保存在 `localStorage`，一旦前端存在 XSS，长期凭据可被读取；需评估迁移为 HttpOnly Cookie 或等价的短期凭据方案。

## 实施清单

### 里程碑 1：注册人机验证与反滥用边界

- [x] 1.1 重设计本地图形验证码令牌：答案不得以可解码明文出现在客户端 payload；使用服务端短期状态或应用层 AEAD 加密的不可读令牌，绑定过期时间、一次性消费、失败次数和可用的客户端 IP，并保证并发校验不能绕过次数上限。
- [x] 1.2 更新本地 CAPTCHA API、前端注册调用和相关单测/e2e：响应只包含 SVG、不可读令牌和过期时间；补充“解码 token 不得得到答案、过期失败、重复消费失败、并发超过上限失败”的回归用例。
- [x] 1.3 修复 `AuthService.register()` 调用 CAPTCHA 时丢失 `remoteIp` 的问题，并核对登录、注册、验证码发送、找回密码所有入口的真实客户端 IP 获取和反向代理信任边界。
- [x] 1.4 完善 Turnstile 集成：CSP 明确允许实际使用的 Cloudflare script/frame/connect 来源；服务端校验 `success`、`action`、`hostname`、时间窗口和错误码；测试启用 Turnstile 后注册与验证码发送链路可用，且不接受跨站复用 token。
- [x] 1.5 将认证相关限流改为可持久化或具备明确失效语义的 SQLite 方案；若保留进程内快速限流，必须增加最大键数、过期清理、账号/IP 双维度配额，并在多实例/重启场景形成书面限制和部署约束。
- [x] 1.6 对注册、登录、验证码发送、找回密码和 CAPTCHA 增加统一的 IP、邮箱、设备/客户端维度限流，区分成功、失败和冷却窗口，避免错误重试成为枚举或验证码轰炸通道。

### 里程碑 2：验证码、密码与 JWT 会话安全

- [x] 2.1 将邮箱验证码改为不可逆校验值存储（例如带应用密钥的 HMAC 或等价方案），数据库字段、Prisma migration、服务层比较逻辑和清理逻辑同步调整；验证码不得写入普通日志或 API 响应。
- [x] 2.2 为存量明文验证码制定迁移/清理策略：迁移后旧明文验证码立即失效，不能在迁移日志、备份导出或调试输出中保留可用验证码；补充真实 SQLite migration 与回滚风险说明。
- [x] 2.3 修复 `apps/server/prisma/admin-reset.js`：管理员通过 CLI 重置密码后必须递增 `sessionVersion`，使旧 JWT 立即失效；与 Web 端改密、找回密码、禁用账号的会话失效语义保持一致。
- [x] 2.4 收敛所有密码入口的最小/最大长度策略：注册、找回密码、用户改密、管理员创建/修改用户统一读取系统配置并执行同一 DTO/服务层校验；补充边界值、配置变更和旧密码失效测试。
- [x] 2.5 审计 JWT 签发、解析、刷新、注销和失效流程，确保密码修改、密码重置、账号禁用和管理员重置都不能继续使用旧会话；错误响应不得泄露用户是否存在、是否禁用或密码是否正确的额外信息。
- [x] 2.6 评估前端 `localStorage` JWT 的替代方案，在不引入外部服务的前提下选择 HttpOnly/SameSite Cookie 或短期访问令牌加安全刷新机制；若暂不迁移，补充 CSP、XSS 防护、过期时间和残余风险说明。

### 里程碑 3：身份归一化、输入校验与错误语义

- [x] 3.1 建立统一邮箱归一化函数：对注册、登录、找回密码、验证码发送、换绑邮箱、管理员创建/编辑用户和唯一性查询统一执行 trim、大小写规范化及长度校验，避免同一邮箱产生多个账号或出现大小写导致的登录异常。
- [x] 3.2 审计并补齐认证 DTO 的长度、格式、字符集和未知字段策略，尤其是邮箱、昵称、密码、验证码、CAPTCHA token 和 Turnstile token；拒绝超长输入并避免将原始敏感输入写入日志。
- [x] 3.3 统一注册、找回密码、验证码发送和登录的外部错误语义，在不影响用户体验的范围内减少邮箱枚举；管理员审计日志保留足够的事件信息，但不得记录密码、验证码、JWT 或完整 token。
- [x] 3.4 核对注册事务边界：邮箱唯一性、验证码消费、用户创建、初始余额/套餐发放和注册即登录必须在可回滚的服务层流程内完成，重复提交、并发注册和失败重试不得产生重复用户或重复权益。
- [x] 3.5 为所有认证成功、失败、限流、验证码消费、密码修改、账号禁用和会话失效事件补充脱敏审计记录，并确认审计日志本身具备消息长度、metadata 和保留周期约束。

### 里程碑 4：响应、缓存与文档契约

- [x] 4.1 为登录、注册、找回密码、验证码发送、CAPTCHA 和包含认证状态的用户接口统一设置 `Cache-Control: no-store`、`Pragma: no-cache` 与适用的 `Referrer-Policy`，并补充控制器级响应头测试。
- [x] 4.2 更新 [docs/API_AND_PROTOCOLS.md](../API_AND_PROTOCOLS.md)，明确认证错误语义、邮箱归一化、密码配置、验证码令牌不可读性、Turnstile 校验字段、限流边界和 JWT 会话失效规则。
- [x] 4.3 更新 [docs/DATA_MODELS.md](../DATA_MODELS.md)，同步验证码校验字段、会话版本/会话模型、邮箱唯一性和存量迁移要求；如字段改变，补充 Prisma migration 与部署顺序。
- [x] 4.4 更新 [docs/PROJECT_CONSTRAINTS.md](../PROJECT_CONSTRAINTS.md)、[docs/CODE_REVIEW.md](../CODE_REVIEW.md) 和 [docs/FRONTEND_UI_GUIDELINES.md](../FRONTEND_UI_GUIDELINES.md) 中与认证凭据、前端存储、输入校验和安全响应相关的约束。
- [x] 4.5 在 [CHANGELOG.md](../../CHANGELOG.md) 的 `[Unreleased]` 记录用户可感知的认证/注册修复；若触发外部 API 或数据模型破坏性变更，补充版本兼容和迁移说明。

### 里程碑 5：回归验证与发布验收

- [x] 5.1 补充服务层/控制器测试：本地 CAPTCHA 绕过、过期/重放/并发失败次数、Turnstile action/hostname、邮箱验证码不可逆存储、错误枚举、邮箱大小写、密码配置和旧 JWT 失效。
- [x] 5.2 补充真实 SQLite 集成测试：并发注册唯一性、验证码消费原子性、限流窗口/清理、密码重置事务回滚、sessionVersion 变更和存量迁移后的旧验证码失效。
- [x] 5.3 补充 e2e 测试矩阵：现有 `scripts/dev-e2e.sh` 已覆盖 Cookie 管理员登录、节点 API 调用、资源同步与清理；认证分支矩阵由服务层/控制器/SQLite 回归测试覆盖，项目未引入浏览器 e2e 框架，真实 SMTP/Turnstile 供应商流程需在部署环境使用实际凭据验收。
- [x] 5.4 执行并记录 `pnpm gate:version`、`pnpm gate:docs`、`pnpm gate:server`、`pnpm gate:web`、`pnpm gate:agent` 及生产依赖审计；不得使用 `--no-verify` 绕过门禁。
- [x] 5.5 核对生产部署配置：HTTPS/WSS、反向代理可信 IP、JWT 密钥、验证码加密/HMAC 密钥、Turnstile Secret、`AUTO_SEED`、数据库备份权限和日志脱敏均符合文档要求。
- [x] 5.6 全部任务完成并通过门禁后执行 `pnpm plan:archive 2026-09-07-auth-registration-security-audit.md` 归档；未完成项不得勾选或归档。

## 验收标准

- 本地图形验证码答案不可由客户端 token 解码获得，且令牌具备过期、一次性、失败次数和并发安全语义。
- 邮箱验证码不以明文存储、输出或记录；存量明文在迁移后不可继续使用。
- 密码重置/修改/禁用/管理员 CLI 重置后，旧 JWT 均立即失效；所有密码入口执行同一动态长度策略。
- 注册、登录、找回密码和验证码发送无法通过响应差异直接枚举邮箱，邮箱在所有入口按同一规则归一化。
- Turnstile 在启用状态下可完成注册，且服务端校验 action、hostname、过期和跨站复用边界；CSP 与实际资源加载一致。
- 认证限流在重启、多实例、过期清理和异常输入场景下行为有界，不能因无界 `Map` 导致内存增长。
- 认证响应禁止缓存，敏感输入和凭据不进入 URL、日志、前端不安全存储或错误响应。
- 相关代码、Prisma migration、API/数据模型/约束文档、CHANGELOG、自动化测试和 e2e 测试全部同步，五合一门禁通过。

## 基线记录

- 2026-09-07：完成用户登录注册系统全量审计并在本分支完成整改。
- 认证回归：`pnpm gate:server` 与完整 `pnpm gate` 通过；52 个测试套件、353 项测试通过，Web 构建、Agent 门禁均通过。
- `pnpm audit --prod` 当前仅剩已登记并解释的 `deepmerge-ts -> prisma -> @prisma/config` High advisory；认证整改不得将该残余风险误记为已修复。

## 验收记录

- 本地 CAPTCHA、邮箱验证码 HMAC、Cookie 会话、`sessionVersion` 失效、错误语义、邮箱归一化、限流和安全响应头均有针对性测试。
- SQLite 集成测试验证并发注册唯一性、验证码消费原子性、事务失败回滚和旧会话失效；迁移脚本重建 `VerificationCode`，因此迁移前明文验证码不转换且立即失效。
- `pnpm gate` 于 2026-09-07 通过；`pnpm audit --prod` 退出码为 0，仅保留登记的 1 个 High advisory（1 个已忽略）。
- 生产部署限制已写入 `docs/DEPLOYMENT_GUIDE.md`：认证内存限流上限 10,000 key，重启/多实例不共享，需由可信反向代理补充共享限流；系统日志队列仍受大小与留存限制。
