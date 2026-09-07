# RiriCloud Agent 更新日志 (Changelog)

本项目 Go 边缘 Agent（riri-agent）的所有显著变更都记录在本文件中。

格式基于 [Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/)，
版本管理遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/) 与
[docs/VERSIONING.md](../../docs/VERSIONING.md)。

变更类型说明：`Added` 新增 · `Changed` 变更 · `Fixed` 修复 · `Removed` 移除 · `Security` 安全 · `Deprecated` 弃用。
约定：日常特性与修复 PR 在 `[Unreleased]` 中维护更新条目；正式发版时运行 `pnpm bump:agent` 固化为版本小节并打 `agent-vA.B.C` Tag。


## [Unreleased]

### Added

### Changed
- **独立版本构建适配**：构建脚本优先读取 `apps/agent/VERSION` 独立版本注入二进制版本标识，解耦对主控根 package.json 的依赖。

### Fixed



## [0.6.14] - 2026-09-07

### Changed
- **独立版本体系分水岭**：Agent 正式从 Master 统一版本管理中解耦，建立独立版本号 `apps/agent/VERSION` 与独立变更日志；首发继承 `0.6.14` 基线版本，后续按 `agent-vA.B.C` 独立迭代发布。
- **架构解耦与纯独立守护**：取消 Master 容器/发行包对 Agent 进程的内嵌托管，Agent 全面作为独立服务或 Docker 容器运行，通过 WS/HTTP 协议连接 Master。
