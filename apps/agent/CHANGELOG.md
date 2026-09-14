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


## [0.7.4] - 2026-09-14

### Added
- **Agent 内嵌 Sing-box 内核直接交付与自愈释放**：新增 `apps/agent/internal/embedded/` 模块，通过 Go `//go:embed` 将定制 Sing-box 内核及依赖库打包于 Agent 二进制中；启动与安装时自动完成 SHA-256 校验与自愈解压释放，无需再向 Master 或 GitHub 二次下载内核。
- **Sing-box 内核 GitHub 下载支持加速镜像**：新增 `GITHUB_MIRRORS` 环境变量 / `--github-mirrors` 安装旗标 / 配置项 `githubMirrors`（前缀代理列表，安装脚本自动注入并持久化）；内核 GitHub 回退路径按「直连 → 镜像」顺序尝试，免安装运行的后台内核自举同样生效。

### Changed
- **内核自愈与启动时序优化**：Agent 启动初期同步自愈释放内嵌内核，确保 Sing-box 管理器与监管子进程初始化前内核文件已就绪；优化惰性版本识别与心跳字段序列化，避免空值导致校验失败。
- **内核确保逻辑显式来源放行**：`kernel.Ensure` 在 `source == "auto"` 且未指定自定义 URL 时优先使用内嵌内核；显式指定 `--singbox-source github` / `master` 或自定义 URL 时放行穿透到远程下载逻辑，支持显式测试与自定义镜像拉取。

### Fixed
- **修复主控心跳网关空版本强校验拦截**：修复内核未就绪上报空版本时被主控网关判定为非法有效负载并标记离线的异常。



## [0.7.3] - 2026-09-14

### Fixed
- **反向穿透隧道鉴权兼容性增强**：在服务端（`RoleServer`）握手鉴权时新增隧道 ID 前缀归一化容错机制，兼容匹配 `tunnel-server-`、`tunnel-client-` 与 `tunnel-` 前缀，确保跨版本主控与 Agent 协同交互时握手鉴权平滑通过。
- **修复自升级重启使用陈旧可执行路径**：`restartSelf` 在原子替换二进制之后才调用 `os.Executable()`，Linux 上 `/proc/self/exe` 会反映改名后的 `.riri-old` 备份路径（实机复现：`fork/exec /usr/local/bin/riri-agent.riri-old: no such file or directory`），导致 spawn 必然失败、旧进程带旧版本继续心跳——即面板画像版本不更新的直接根因。现改为启动时解析一次可执行路径并缓存，自拉起与服务工厂均使用该路径；路径缺失时自拉起直接报错，绝不 exec 备份文件。
- **升级后进程接管策略重构**：修复远程升级替换二进制后仅依赖自拉起（spawn 新进程 + 退出）导致的静默失败——spawn 失败时旧进程带旧版本继续心跳，面板画像版本永远不更新。重启决策改为系统服务重启优先（服务已安装且运行中时直接 `svc.Restart()`，由 systemd/SCM 立即从磁盘新二进制拉起并恢复监管，同时消除自拉起导致的 `RestartSec=120` 空窗与双连接竞态）；未安装服务、状态检测失败或服务重启失败时降级为原有自拉起兜底。两路均失败时旧进程继续运行，WS 模式会向主控上报 `log_report` 错误日志，配合主控升级版本对账在 5 分钟内暴露"重启可能失败"。



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
