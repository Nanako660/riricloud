---
title: "Agent 现代化交互式 CLI 与全生命周期管理架构（破坏性重构）"
type: plan
status: completed
target_version: v0.4.1
created_at: "2026-09-01"
author: "Antigravity & Maintainers"
archived_at: "2026-09-01"
---
# Agent 现代化交互式 CLI 与全生命周期管理架构（破坏性重构）

## 🎯 目标与背景

当前 `riri-agent` 仅作为单一后台守护进程运行，安装与运维严重依赖外部 shell 脚本（`install-agent.sh`）。一旦环境缺少脚本或主控二进制分发不同步，排查成本高且缺乏干净的自卸载、状态巡检与故障自愈机制。

本次进行**彻底的破坏性重构（Breaking Change）**，彻底移除旧版 Shell 脚本，将 `riri-agent` 升级为**自带高颜值交互界面的自包含 CLI 工具**：

1. **彻底下线 Shell 脚本**：移除 `scripts/install-agent.sh` 与主控的 `GET /api/v1/install.sh` 端点，主控新增智能自适应下载端点 `GET /api/v1/downloads/agent`。
2. **双模交互架构**：
   - **交互式 TUI 向导（直接运行 `riri-agent`）**：展示 ASCII Banner、动态高亮主菜单、安装引导表单、服务启停切换、实时状态查看、Doctor 诊断与一键干净卸载。
   - **扁平一级子命令（供非交互式/脚本调用）**：`install`、`uninstall`、`start`、`stop`、`restart`、`status`、`doctor`、`logs`、`run`、`version`。
3. **跨平台系统服务自管理**：
   - 引入 `kardianos/service`，原生支持 Linux (systemd / OpenRC / SysVinit)、Windows Service、macOS Launchd 的注册、注销、自启与控制。
4. **标准配置与目录分层**：
   - 二进制：`/usr/local/bin/riri-agent`
   - 主配置：`/etc/riri-agent/config.yaml`（替代旧 `.env`）
   - 内核与运行时：`/var/lib/riri-agent/`（集中存放 `sing-box` 内核与 `config.json` 运行时配置）
5. **100% 彻底干净卸载 (`riri-agent uninstall --purge`)**：
   - 精准清理服务单元、托管目录、配置文件与运行时孤儿进程。
6. **终端视觉与自检诊断**：
   - 使用 `charmbracelet/lipgloss` 打造精美的渐变色卡片、表格与彩色日志流。
   - 内置 `doctor` 模块：检测 Master 连通性、WebSocket/HTTP 握手、DNS、Sing-box 语法与端口冲突。

---

## 📋 里程碑与任务清单

### 里程碑 1：Agent 核心 CLI 框架与配置分层
- [x] 任务 1.1: 引入 Go 依赖（`github.com/spf13/cobra`、`github.com/charmbracelet/lipgloss`、`github.com/kardianos/service`、`gopkg.in/yaml.v3`），校验 0 CGO 约束。
- [x] 任务 1.2: 重构 `apps/agent/internal/config` 支持 `/etc/riri-agent/config.yaml` 的读写与默认路径查找。
- [x] 任务 1.3: 搭建 `apps/agent/cmd` Cobra 根命令与子命令骨架（`install`、`uninstall`、`start`、`stop`、`restart`、`status`、`doctor`、`logs`、`run`、`version`）。
- [x] 任务 1.4: 改造 `apps/agent/main.go` 入口，支持前台运行守护进程与 CLI 命令分发。

### 里程碑 2：跨平台服务管理与生命周期实施
- [x] 任务 2.1: 基于 `kardianos/service` 实现 `apps/agent/internal/system/service.go`（支持 Linux systemd、Windows Service、macOS Launchd 安装、自启注册、状态查询与启停）。
- [x] 任务 2.2: 实现 `riri-agent install` 命令（支持从 Master 或 GitHub 自动探测下载 `sing-box` 内核至 `/var/lib/riri-agent`，生成 `config.yaml` 并注册自启服务）。
- [x] 任务 2.3: 实现 `riri-agent uninstall` 命令（支持 `--purge`，完全注销系统服务，彻底删除 `/etc/riri-agent`、`/var/lib/riri-agent` 及残留进程）。
- [x] 任务 2.4: 实现 `riri-agent start`、`stop`、`restart`、`status` 一级控制子命令。

### 里程碑 3：终端视觉 TUI、彩色日志与 Doctor 诊断
- [x] 任务 3.1: 基于 `charmbracelet/lipgloss` 实现 `apps/agent/internal/tui/`（ASCII 渐变 Banner、状态卡片、遥测表格与交互式方向键菜单）。
- [x] 任务 3.2: 实现无参数直接运行 `riri-agent` 时的交互式向导（菜单选择：安装、状态、启停、体检、日志、卸载）。
- [x] 任务 3.3: 实现 `riri-agent doctor` 全链路诊断（检查 Master 连通性、通信模式握手、Sing-box 语法测试、端口占用排查）。
- [x] 任务 3.4: 实现 `riri-agent logs` 实时彩色日志查看器（支持 `--follow`、`--lines` 与级别色彩高亮）。

### 里程碑 4：主控端（Master）接口改造与 Web 面板同步
- [x] 任务 4.1: 在 `apps/server/src/binaries` 中移除 `GET /api/v1/install.sh`，移除 `scripts/install-agent.sh`。
- [x] 任务 4.2: 在 `apps/server/src/binaries` 新增 `GET /api/v1/downloads/agent` 智能自适应端点（根据 User-Agent 自动 302 重定向到对应平台二进制）。
- [x] 任务 4.3: 更新 `apps/server/src/nodes/nodes.service.ts` 的 `buildInstallCommand` 生成全新的原生 CLI 一键安装命令。
- [x] 任务 4.4: 更新 `apps/web/src/pages/admin/nodes/detail.tsx` 弹窗，呈现最新的原生 CLI 安装与一键卸载命令。
- [x] 任务 4.5: 更新 `Dockerfile` 与打包构建流程，移除对 `install-agent.sh` 的复制与打包。

### 里程碑 5：质量门禁、文档治理与验证
- [x] 任务 5.1: 编写/更新 Server 端与 Agent 端单元测试。
- [x] 任务 5.2: 更新 `docs/DEPLOYMENT_GUIDE.md`（改为原生 CLI 安装与运维指南）。
- [x] 任务 5.3: 更新 `docs/API_AND_PROTOCOLS.md` 与 `docs/TECH_STACK.md`。
- [x] 任务 5.4: 更新 `docs/ROADMAP.md` 与 `CHANGELOG.md` 登记 `v0.4.1` 破坏性变更特性。
- [x] 任务 5.5: 运行全量质量门禁（`pnpm gate`）验证全绿。

---

## 🧪 验收标准与测试记录

- [x] `riri-agent` 无参数在交互式终端中输出精美 TUI 菜单并可响应键盘输入。
- [x] `riri-agent install --token=... --master=...` 成功在 Linux/Windows 注册自启服务并下载 sing-box。
- [x] `riri-agent status` 正确输出连接状态与系统资源卡片。
- [x] `riri-agent doctor` 准确诊断网络与内核健康度。
- [x] `riri-agent uninstall --purge` 100% 干净删除所有服务与目录。
- [x] 主控端 `GET /api/v1/downloads/agent` 智能重定向工作正常，旧 `install.sh` 完全下线。
- [x] 四端门禁 `pnpm gate`（`gate:docs` + `gate:server` + `gate:web` + `gate:agent`）全绿。
