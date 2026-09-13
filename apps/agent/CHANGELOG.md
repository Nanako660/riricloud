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

### Fixed


## [0.7.2] - 2026-09-13

### Added
- **免安装直接运行（便携模式）内核自举**：`riri-agent run` 仅凭 `AGENT_TOKEN` 等环境变量即可前台运行（配置文件可选），sing-box 内核缺失时后台自动下载（`--singbox-source auto|master|github|none`，默认 auto 先主控后 GitHub，失败按 5 分钟间隔重试，不阻断 Agent 存活）；显式设置 `SINGBOX_BINARY_PATH` 视为用户自管内核跳过下载。新增 `--singbox-url` 与 `--singbox-version` 旗标及 `SINGBOX_SOURCE` 环境变量。
- **日志目录错误提示**：日志目录创建或打开失败时，错误信息附带 `RIRICLOUD_DATA_DIR` / `RIRICLOUD_LOG_PATH` 可写目录设置提示。

### Changed
- `internal/install` 的 sing-box 下载逻辑抽取为可复用的 `internal/kernel` 包，安装与免安装运行共用同一内核获取链路。

### Fixed
- **修复 Windows 服务模式下 agent.log 恒为空**：日志输出原为 `io.MultiWriter(os.Stdout, file)`，而 Windows 服务进程的 stdout 是无效句柄，`MultiWriter` 遇到写入失败即短路跳过后续 writer，导致文件永远收不到日志（`riri-agent logs` 与 TUI 查看日志随之失效）。现改为文件优先写入，并仅在 stdout 可用的上下文（前台终端、Linux systemd/容器）附加 stdout 镜像；服务模式下不再产生无效写入。
- **修复无法以 Windows 服务方式启动/停止（错误 1053）**：Agent 二进制此前缺少 Windows SCM 服务端入口，SCM 拉起 `riri-agent run` 后从未上报 `SERVICE_RUNNING`，导致服务启动/停止/安装一律以 "The service did not respond to the start or control request in a timely fashion" 超时失败。现检测 Windows 服务上下文并接入 `kardianos/service` 生命周期（`Start` 非阻塞拉起守护进程、`Stop` 取消上下文并限时等待优雅退出），Linux/macOS 前台行为不变。



## [0.7.1] - 2026-09-13

### Added
- **原生 TCP/TLS 反向多路复用隧道引擎 (Yamux)**：新增 `internal/tunnel` 核心模块，支持 `SERVER`（公网入口 VPS 监听与本地端口转发桥接）与 `CLIENT`（内网 NAT 落地端主动拨号与本地 Sing-box 流量泵出）双模式。基于 `github.com/hashicorp/yamux` 实现高并发流式解复用，严格遵循 `CGO_ENABLED=0`，零系统依赖，常驻内存 < 30MB，免疫家庭宽带 UDP QoS 限速并完全免除 root/TUN 特权要求。
- **长连接心跳保活与指数退避断线自愈**：客户端集成 25 秒周期底层 Ping 探测与超时自毁判定，内置 1s~30s 指数退避断线重连状态机，提供对家庭宽带运营商 PPPoE 定时重拨、光猫休眠与网络瞬断的秒级平滑自愈。



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
