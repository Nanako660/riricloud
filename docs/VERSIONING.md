# 版本管理规范 (Versioning)

本文档定义 **RiriCloud** 的版本号规则、递增原则与发布流程。所有参与开发的贡献者（人类与 AI 代理）在提合并、打 Tag、写 CHANGELOG 时都必须遵守本规范。

---

## 1. 语义化版本 (SemVer) 基础

版本号格式为 `MAJOR.MINOR.PATCH`（遵循 [SemVer 2.0.0](https://semver.org/lang/zh-CN/)）：

| 位 | 名称 | 何时递增 |
| :--- | :--- | :--- |
| `MAJOR` | 主版本 | 引入**不兼容的破坏性变更**（API 契约变更、数据库不兼容迁移、WS 协议消息格式破坏等） |
| `MINOR` | 次版本 | 新增**向后兼容**的功能 |
| `PATCH` | 修订版本 | 向后兼容的 **缺陷修复** 或微小的改进 |

递增任何一位时，其右侧所有位归零：`0.2.7` → `0.3.0` → `1.0.0`。

---

## 2. 核心原则：最小递增 (Minimal Bump)

**能升 PATCH 就不升 MINOR，能升 MINOR 就不升 MAJOR。** 版本号是对外契约的承诺，任何夸大的递增都会放大用户的升级成本。

1. **默认动作是 PATCH**：一个变更只要没有引入新能力、没有破坏任何既有行为，就一律按 PATCH 递增。修文案、调样式、优化日志、重构内部实现均属此类。
2. **MINOR 只在「用户可感知的新能力」时递增**：新增 API 端点、新增订阅输出格式、面板新增页面、WS 协议新增消息类型（且旧 Agent 能安全忽略）。
3. **MAJOR 只在「不升级就坏」时递增**：破坏 REST/WS 协议兼容、Prisma 迁移需要人工介入、配置文件格式不兼容导致旧 Agent 无法工作、统一版本号策略下的任一子应用发生破坏性变更（见 §4）。
4. **拿不准时的裁决顺序**：按 PATCH → MINOR → MAJOR 的顺序逐级自查，最低满足者即为答案；仍无法判断时在 PR 中提出讨论，而非直接选高版本。

### 2.1 0.x 阶段的特殊规则

- 项目起步版本为 **`0.1.0`**，表示"已具备可运行的基础形态，但 API 尚不稳定"。
- 依据 SemVer 官方语义，`0.x` 阶段的 **MINOR 递增允许包含破坏性变更**（`0.x` 的 MINOR 等价于 1.0 之后的 MAJOR）。因此 0.x 期间的破坏性变更升 MINOR 而非 MAJOR，但仍必须：
  - 在 commit 中标注 `BREAKING CHANGE` footer；
  - 在 [CHANGELOG.md](../CHANGELOG.md) 中明确写出破坏点与迁移方式。
- **`1.0.0` 的触发条件**（满足其一即应规划 1.0）：
  - Master-Agent WS 协议与 REST API 契约进入冻结期，开始承诺向后兼容；
  - 系统已在生产环境持续运行且完成 Phase 5 端到端验收（见 [ROADMAP.md](./ROADMAP.md)）。

---

## 3. 统一版本号策略

Monorepo 中的 `apps/web`、`apps/server`、`apps/agent` **共用同一个版本号，同步发布**。

理由：Master 与 Agent 之间存在 WS 协议与配置下发契约的强耦合，独立版本号会催生一张难以维护的兼容性矩阵；统一版本意味着"同版本号的 Master 与 Agent 一定兼容"这一简单承诺。

| 事项 | 约定 |
| :--- | :--- |
| **唯一版本源** | 根目录 `package.json` 的 `version` 字段，子包 `package.json` 与 `apps/agent` 一律不得私自维护版本号 |
| **README 徽标** | 根目录 `README.md` 顶部的 Version 徽标由 `pnpm bump` 自动同步，并由 `pnpm gate:version` 强校验一致性 |
| **Agent 注入** | Go 构建时通过 `-ldflags "-X main.Version=$(node -p "require('./package.json').version")"` 注入，运行时随心跳上报 |
| **Server 暴露** | NestJS 提供只读的 `GET /api/v1/system/version`，返回统一版本号（打包时从根 `package.json` 读取） |
| **Web 展示** | 前端构建时由 Vite `define` 注入，在管理台"系统信息"中展示 |

---

## 4. 变更影响面速查表

发布前用下表快速判断本次应递增的版本位：

| 变更内容 | 版本位 |
| :--- | :--- |
| Bug 修复、UI 微调、日志/注释、内部重构、依赖安全升级 | PATCH |
| 新增 API 端点 / WS 消息类型（旧 Agent 可安全忽略） | MINOR |
| 新增节点协议类型、新增订阅输出格式 | MINOR |
| 新增数据库表 / 字段（含可回滚的自动迁移） | MINOR |
| 数据库字段删除或语义变更、WS 消息格式破坏性调整 | MAJOR（1.0 前：MINOR + BREAKING CHANGE 标注） |
| 更换核心框架 / 技术栈（见 [PROJECT_CONSTRAINTS.md](./PROJECT_CONSTRAINTS.md)） | MAJOR + 专项 RFC |
| 仅文档、脚本、CI 变更 | **不发布**，不打 Tag |

---

## 5. Git Tag 与 CHANGELOG 规范

1. **Tag 格式**：`v{version}`（如 `v0.4.0`、`v1.2.3`），采用附注 Tag（`git tag -a`），仅在 `main` 分支上打。
2. **Tag 与 CHANGELOG 一一对应**：每个版本 Tag 必须对应 [CHANGELOG.md](../CHANGELOG.md) 中的一个版本小节；反之每个版本小节发布时打 Tag。两者任一缺失视为发布流程不完整。
3. **CHANGELOG 遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)**，变更归类为 `Added` / `Changed` / `Fixed` / `Removed` / `Security` / `Deprecated`。
4. **日常 PR 维护 `[Unreleased]` 缓冲区**：每个包含核心代码变更的 PR 在开发分支中仅向 `CHANGELOG.md` 顶部的 `## [Unreleased]` 缓冲区追加条目，保持 `package.json` 版本不变。
5. **发版时统一 Bump 固化**：发版前拉出 `release/vX.Y.Z` 分支执行 `pnpm bump`，自动将 `[Unreleased]` 中的条目固化为定稿版本小节，并在顶部重置新的空 `[Unreleased]` 模板。
6. 一个版本小节内的条目按"对用户的重要性"排序，而非时间顺序。

---

## 6. 版本累积管理与发布流程

采用标准的 **`[Unreleased]` 缓冲累积 + Release PR 统一发版** 工作流：

```mermaid
flowchart TD
    subgraph 日常开发流 ["日常开发（特性 / 修复 PR）"]
        A["特性分支开发完成"] --> B["修改核心代码时向<br/>CHANGELOG.md [Unreleased] 追加条目"]
        B --> C["保持 package.json 版本不变"]
        C --> D{"本地 pnpm gate<br/>(含 gate:version)"}
        D -->|未记日志 / 格式不符| E["❌ 门禁阻断"]
        D -->|通过| F["提 PR 经 CI 验证后<br/>Squash 合入 main"]
    end

    subgraph 发版发布流 ["发版流程（Release PR & GitHub Release）"]
        G["准备对外发版"] --> H["切出 release/vX.Y.Z 分支<br/>执行 pnpm bump [patch|minor|major]"]
        H --> I["Unreleased 自动转换为版本小节<br/>更新 package.json 与 README 徽标<br/>重置顶部空 Unreleased 模板"]
        I --> J["提 Release PR 合入 main"]
        J --> K["在 main 分支执行<br/>bash scripts/release.sh"]
        K --> L["创建附注 Tag vX.Y.Z<br/>构建三端产物并发布 GitHub Release"]
    end
```

### 6.1 核心代码判定与免增规则

- **日常 PR 日志约束**：修改了 `apps/server/`、`apps/web/`、`apps/agent/` 或 `prisma/` 下的代码时，PR 必须在 `CHANGELOG.md` 的 `[Unreleased]` 缓冲区中记录变更。
- **免增放行**：纯文档（`docs/`）、开发脚本（`scripts/`）、本地配置微调且不包含运行时代码变更时，`pnpm gate:version` 允许免增 CHANGELOG 放行。

### 6.2 工具链与三重防线

- **辅助命令**：
  - `pnpm bump`：默认自增 PATCH（如 `0.4.13` → `0.4.14`），将 `[Unreleased]` 转化为版本小节并同步更新 `package.json`、`README.md` 徽标与顶部新 `[Unreleased]` 模板；
  - `pnpm bump minor`：自增 MINOR（如 `0.4.13` → `0.5.0`）；
  - `pnpm bump major`：自增 MAJOR（如 `0.4.13` → `1.0.0`）。
- **三重防线**：
  1. **本地质量门禁**：`pnpm gate` 纳入 `pnpm gate:version`（`scripts/version-governance.mjs check`，校验 `package.json`、`CHANGELOG.md` 结构与 PR 阶段的 `[Unreleased]` 维护情况）；
  2. **Git 钩子拦截**：`.husky/pre-push` 在推送特性分支前执行轻量校验；
  3. **CI 门禁阻断**：`.github/workflows/ci.yml` 在 PR 阶段强制比对基准分支，核心代码变更未维护 `[Unreleased]` 日志或发版版本脱节时直接阻断 PR 合并。

### 6.3 正式发布 (Release)

- **触发时机**：当 `main` 上的 `[Unreleased]` 功能已积累完成并通过 Release PR 固化版本后，在 `main` 分支执行 `bash scripts/release.sh`。
- **自动化**：`scripts/release.sh` 会自动校验当前 `package.json` 版本与 `CHANGELOG.md` 一致性、创建附注 Tag `vX.Y.Z`、复跑三端门禁、交叉编译 Agent 与主控发行包，并通过 `gh` CLI 创建 GitHub Release。

