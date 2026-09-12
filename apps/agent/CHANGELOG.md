# RiriCloud Agent 更新日志 (Changelog)

本项目 Go 边缘 Agent（riri-agent）的所有显著变更都记录在本文件中。

格式基于 [Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/)，
版本管理遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/) 与
[docs/VERSIONING.md](../../docs/VERSIONING.md)。

变更类型说明：`Added` 新增 · `Changed` 变更 · `Fixed` 修复 · `Removed` 移除 · `Security` 安全 · `Deprecated` 弃用。
约定：日常特性与修复 PR 在 `[Unreleased]` 中维护更新条目；正式发版时运行 `pnpm bump:agent` 固化为版本小节并打 `agent-vA.B.C` Tag。


## [Unreleased]

### Added
- **原生 TCP/TLS 反向多路复用隧道引擎 (Yamux)**：新增 `internal/tunnel` 核心模块，支持 `SERVER`（公网入口 VPS 监听与本地端口转发桥接）与 `CLIENT`（内网 NAT 落地端主动拨号与本地 Sing-box 流量泵出）双模式。基于 `github.com/hashicorp/yamux` 实现高并发流式解复用，严格遵循 `CGO_ENABLED=0`，零系统依赖，常驻内存 < 30MB，免疫家庭宽带 UDP QoS 限速并完全免除 root/TUN 特权要求。
- **长连接心跳保活与指数退避断线自愈**：客户端集成 25 秒周期底层 Ping 探测与超时自毁判定，内置 1s~30s 指数退避断线重连状态机，提供对家庭宽带运营商 PPPoE 定时重拨、光猫休眠与网络瞬断的秒级平滑自愈。

### Changed

### Fixed


## [0.7.0] - 2026-09-09

### Added
- **节点镜像代理**：新增 `mirror_proxy` 能力宣告与受限 HTTP/HTTPS GET/HEAD 执行器，支持安全重定向、Range/条件请求、二进制流式回传、取消、超时、响应大小和并发限制。

### Changed
- **独立版本构建适配**：构建脚本优先读取 `apps/agent/VERSION` 独立版本注入二进制版本标识，解耦对主控根 package.json 的依赖。

### Fixed
- **无交互与 Docker 环境 TTY 判定修复**：引入 `github.com/mattn/go-isatty` 精准判定控制台终端，修复非交互与 Docker 容器环境因 Stdin 为 `/dev/null` 误触发 Bubble Tea 全屏 TUI 导致 cancelreader epoll 崩溃退出的缺陷；镜像默认补充 `CMD ["run"]` 守护指令。



## [0.6.14] - 2026-09-07

### Changed
- **独立版本体系分水岭**：Agent 正式从 Master 统一版本管理中解耦，建立独立版本号 `apps/agent/VERSION` 与独立变更日志；首发继承 `0.6.14` 基线版本，后续按 `agent-vA.B.C` 独立迭代发布。
- **架构解耦与纯独立守护**：取消 Master 容器/发行包对 Agent 进程的内嵌托管，Agent 全面作为独立服务或 Docker 容器运行，通过 WS/HTTP 协议连接 Master。
